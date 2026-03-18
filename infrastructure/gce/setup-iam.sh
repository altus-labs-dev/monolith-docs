#!/usr/bin/env bash
# Sets up the service account and IAM bindings for Monolith Docs.
# Run once per GCP project.
#
# Usage: ./setup-iam.sh <project-id> [bucket-name]
# Example: ./setup-iam.sh monolith-docs monolith-docs-files

set -euo pipefail

PROJECT_ID="${1:?Usage: ./setup-iam.sh <project-id> [bucket-name]}"
BUCKET_NAME="${2:-}"
SA_NAME="monolith-docs-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Monolith Docs IAM Setup ==="
echo "Project:         ${PROJECT_ID}"
echo "Service Account: ${SA_EMAIL}"
echo ""

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create "${SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="Monolith Docs Service Account" \
  --description="Service account for Monolith Docs API and OnlyOffice" \
  2>/dev/null || echo "  (already exists)"

# Grant logging and monitoring
echo "Granting logging/monitoring roles..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None --quiet

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/monitoring.metricWriter" \
  --condition=None --quiet

# Grant GCS access if bucket specified
if [[ -n "${BUCKET_NAME}" ]]; then
  echo "Granting GCS access on gs://${BUCKET_NAME}..."
  gsutil iam ch "serviceAccount:${SA_EMAIL}:roles/storage.objectAdmin" \
    "gs://${BUCKET_NAME}" 2>/dev/null || \
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" --quiet
fi

echo ""
echo "=== Done ==="
echo "Service account: ${SA_EMAIL}"
echo ""
echo "Next steps:"
echo "  1. Run deploy.sh to create the GCE VM"
echo "  2. The VM will use this service account automatically"
