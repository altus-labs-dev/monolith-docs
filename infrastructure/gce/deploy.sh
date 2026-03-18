#!/usr/bin/env bash
# Provisions a GCE VM for Monolith Docs.
#
# Usage: ./deploy.sh <env>
# Example: ./deploy.sh dev
#          ./deploy.sh prod

set -euo pipefail

ENV="${1:?Usage: ./deploy.sh <env> (dev|prod)}"
PROJECT_ID="monolith-docs"
REGION="us-central1"
ZONE="${REGION}-a"
SA_EMAIL="monolith-docs-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

echo "=== Monolith Docs GCE Deployment ==="
echo "Environment:  ${ENV}"
echo "Project:      ${PROJECT_ID}"
echo "VM:           ${VM_NAME}"
echo "Machine type: ${MACHINE_TYPE}"
echo "Disk:         ${DISK_SIZE}GB SSD"
echo "Zone:         ${ZONE}"
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
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="monolith-docs-${ENV}"
else
  echo "Firewall rule ${FIREWALL_RULE} already exists."
fi

# Create the VM
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
  --metadata-from-file=startup-script="${SCRIPT_DIR}/startup.sh"

# Get external IP
EXTERNAL_IP=$(gcloud compute instances describe "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo "=== VM Created ==="
echo "Name:        ${VM_NAME}"
echo "External IP: ${EXTERNAL_IP}"
echo "SSH:         gcloud compute ssh ${VM_NAME} --project=${PROJECT_ID} --zone=${ZONE}"
echo ""
echo "Next steps:"
echo "  1. SSH into the VM and configure .env"
echo "  2. Set up DNS: point docs-${ENV}.monolithcrm.com → ${EXTERNAL_IP}"
echo "  3. Run: sudo certbot --nginx -d docs-${ENV}.monolithcrm.com"
echo "  4. Copy NGINX config: infrastructure/nginx/monolith-docs.conf → /etc/nginx/sites-available/"
