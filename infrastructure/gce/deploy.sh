#!/usr/bin/env bash
# Provisions a GCE VM for Monolith Docs.
#
# Usage: ./deploy.sh <env> [git-ref]
# Example: ./deploy.sh dev
#          ./deploy.sh dev feature/standalone-phase-0
#          ./deploy.sh prod <commit-sha>

set -euo pipefail

ENV="${1:?Usage: ./deploy.sh <env> (dev|prod) [git-ref]}"
DEPLOY_REF="${2:-main}"
PROJECT_ID="monolith-docs"
REGION="us-west1"
ZONE="${REGION}-a"
SA_EMAIL="monolith-docs-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_STARTUP_SCRIPT="/tmp/monolith-docs-startup.sh"
DEPLOY_STATE_DIR="/opt/monolith-docs/.deploy-state"
DEPLOY_REF_ESCAPED="$(printf '%q' "${DEPLOY_REF}")"
DEPLOY_ENV_ESCAPED="$(printf '%q' "${ENV}")"
CREATED_INSTANCE=0
RUN_REMOTE_DEPLOY=0
INSTANCE_STATUS=""

case "${ENV}" in
  dev)
    VM_NAME="monolith-docs-dev"
    MACHINE_TYPE="e2-medium"
    DISK_SIZE="40"
    ;;
  prod)
    VM_NAME="monolith-docs-prod"
    MACHINE_TYPE="e2-standard-2"
    DISK_SIZE="80"
    ;;
  *)
    echo "Unknown environment: ${ENV}. Use 'dev' or 'prod'."
    exit 1
    ;;
esac

instance_exists() {
  gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    >/dev/null 2>&1
}

instance_status() {
  gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='value(status)'
}

wait_for_ssh() {
  for attempt in $(seq 1 30); do
    if gcloud compute ssh "${VM_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --command "echo ssh-ready" \
      >/dev/null 2>&1; then
      return
    fi

    sleep 10
  done

  echo "Timed out waiting for SSH on ${VM_NAME}."
  exit 1
}

wait_for_remote_health() {
  for attempt in $(seq 1 30); do
    if gcloud compute ssh "${VM_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --command "test -f ${DEPLOY_STATE_DIR}/current-sha && curl -fsS http://127.0.0.1:3020/health >/dev/null && curl -fsS http://127.0.0.1:3020/api/status >/dev/null" \
      >/dev/null 2>&1; then
      return
    fi

    sleep 10
  done

  echo "Timed out waiting for deployed service health on ${VM_NAME}."
  exit 1
}

validate_remote_env() {
  local remote_status
  remote_status="$(gcloud compute ssh "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --command "if [[ ! -f /opt/monolith-docs/.env ]]; then echo missing; elif grep -Eq '^[[:space:]]*[^#].*<generate:' /opt/monolith-docs/.env; then echo placeholders; else echo ok; fi" \
    2>/dev/null | tr -d '\r')"

  case "${remote_status}" in
    ok)
      return
      ;;
    missing)
      echo "Remote .env is missing on ${VM_NAME}."
      echo "Provision /opt/monolith-docs/.env from infrastructure/environments/${ENV}/env.example before deploying."
      exit 1
      ;;
    placeholders)
      echo "Remote .env on ${VM_NAME} still contains unreplaced <generate: ...> placeholders."
      echo "Replace generated placeholders before deploying."
      exit 1
      ;;
    *)
      echo "Unable to validate remote .env state on ${VM_NAME}."
      exit 1
      ;;
  esac
}

echo "=== Monolith Docs GCE Deployment ==="
echo "Environment:  ${ENV}"
echo "Project:      ${PROJECT_ID}"
echo "VM:           ${VM_NAME}"
echo "Machine type: ${MACHINE_TYPE}"
echo "Disk:         ${DISK_SIZE}GB SSD"
echo "Zone:         ${ZONE}"
echo "Deploy ref:   ${DEPLOY_REF}"
echo ""

# Create firewall rule if it doesn't exist
FIREWALL_RULE="allow-monolith-docs-${ENV}"
if ! gcloud compute firewall-rules describe "${FIREWALL_RULE}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating firewall rule ${FIREWALL_RULE}..."
  gcloud compute firewall-rules create "${FIREWALL_RULE}" \
    --project="${PROJECT_ID}" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="monolith-docs-${ENV}"
else
  echo "Firewall rule ${FIREWALL_RULE} already exists."
fi

if ! instance_exists; then
  CREATED_INSTANCE=1
  echo "Creating VM ${VM_NAME}..."
  gcloud compute instances create "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --machine-type="${MACHINE_TYPE}" \
    --boot-disk-size="${DISK_SIZE}GB" \
    --boot-disk-type=pd-ssd \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --service-account="${SA_EMAIL}" \
    --scopes=cloud-platform \
    --tags="monolith-docs-${ENV},http-server,https-server" \
    --metadata="deploy-ref=${DEPLOY_REF},deploy-env=${ENV}" \
    --metadata-from-file=startup-script="${SCRIPT_DIR}/startup.sh"
else
  INSTANCE_STATUS="$(instance_status)"
  echo "VM ${VM_NAME} already exists with status: ${INSTANCE_STATUS}"
fi

echo "Updating instance metadata..."
gcloud compute instances add-metadata "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --metadata="deploy-ref=${DEPLOY_REF},deploy-env=${ENV}" \
  --metadata-from-file=startup-script="${SCRIPT_DIR}/startup.sh"

if [[ "${CREATED_INSTANCE}" -eq 0 ]]; then
  case "${INSTANCE_STATUS}" in
    RUNNING)
      RUN_REMOTE_DEPLOY=1
      ;;
    TERMINATED|SUSPENDED)
      echo "Starting existing VM ${VM_NAME}..."
      gcloud compute instances start "${VM_NAME}" \
        --project="${PROJECT_ID}" \
        --zone="${ZONE}"
      ;;
    PROVISIONING|STAGING)
      echo "VM ${VM_NAME} is already booting; waiting for SSH."
      ;;
    *)
      echo "Unsupported VM state '${INSTANCE_STATUS}' for deploy."
      echo "Bring ${VM_NAME} to RUNNING or TERMINATED before retrying."
      exit 1
      ;;
  esac
fi

wait_for_ssh
validate_remote_env

if [[ "${RUN_REMOTE_DEPLOY}" -eq 1 ]]; then
  echo "Uploading startup script for in-place deploy..."
  gcloud compute scp "${SCRIPT_DIR}/startup.sh" "${VM_NAME}:${REMOTE_STARTUP_SCRIPT}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}"

  echo "Running remote deploy..."
  gcloud compute ssh "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --command "sudo env DEPLOY_REF=${DEPLOY_REF_ESCAPED} DEPLOY_ENV=${DEPLOY_ENV_ESCAPED} bash ${REMOTE_STARTUP_SCRIPT}"
fi

wait_for_remote_health

# Get external IP
EXTERNAL_IP=$(gcloud compute instances describe "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

CURRENT_SHA=$(gcloud compute ssh "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --command "cat ${DEPLOY_STATE_DIR}/current-sha" 2>/dev/null | tr -d '\r')

PREVIOUS_SHA=$(gcloud compute ssh "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --command "cat ${DEPLOY_STATE_DIR}/previous-sha 2>/dev/null || true" 2>/dev/null | tr -d '\r')

echo ""
echo "=== Deploy Complete ==="
echo "Name:        ${VM_NAME}"
echo "External IP: ${EXTERNAL_IP}"
echo "SSH:         gcloud compute ssh ${VM_NAME} --project=${PROJECT_ID} --zone=${ZONE}"
echo "Current SHA: ${CURRENT_SHA}"
if [[ -n "${PREVIOUS_SHA}" ]]; then
  echo "Previous SHA: ${PREVIOUS_SHA}"
  echo "Rollback:    ./infrastructure/gce/deploy.sh ${ENV} ${PREVIOUS_SHA}"
fi
echo ""
echo "Next steps:"
echo "  1. Verify VM-local health: curl http://127.0.0.1:3020/health and /api/status over SSH"
echo "  2. Set up or confirm DNS: point app.monolithdocs.com → ${EXTERNAL_IP} (Cloudflare proxied)"
echo "  3. Generate Cloudflare origin certificate for app.monolithdocs.com"
echo "  4. Place origin cert at /etc/ssl/cloudflare/origin.pem and key at origin.key"
echo "  5. Run infrastructure/cloudflare/setup-tunnel.sh for connect/crm subdomain routing"
echo "  6. Copy NGINX config and reload: infrastructure/nginx/monolith-docs.conf"
