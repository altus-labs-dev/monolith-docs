#!/usr/bin/env bash
# Tears down a Monolith Docs GCE VM.
#
# Usage: ./teardown.sh <env>
# Example: ./teardown.sh dev

set -euo pipefail

ENV="${1:?Usage: ./teardown.sh <env> (dev|prod)}"
PROJECT_ID="monolith-docs"
ZONE="us-west1-a"

case "${ENV}" in
  dev)  VM_NAME="monolith-docs-dev" ;;
  prod) VM_NAME="monolith-docs-prod" ;;
  *)    echo "Unknown environment: ${ENV}"; exit 1 ;;
esac

echo "=== Tearing down ${VM_NAME} ==="
echo "This will DELETE the VM and its boot disk."
read -rp "Continue? [y/N] " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

gcloud compute instances delete "${VM_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --quiet

echo "VM ${VM_NAME} deleted."
