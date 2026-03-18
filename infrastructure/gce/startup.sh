#!/usr/bin/env bash
# GCE VM startup script for Monolith Docs.
# This runs automatically when the VM starts (via metadata startup-script).
# It installs Docker, pulls the repo, and starts services.

set -euo pipefail

LOG="/var/log/monolith-docs-startup.log"
exec > >(tee -a "${LOG}") 2>&1
echo "=== Monolith Docs startup $(date) ==="

# Install Docker if not present
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  apt-get update -y
  apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

# Install NGINX if not present
if ! command -v nginx &>/dev/null; then
  echo "Installing NGINX..."
  apt-get install -y nginx
  systemctl enable nginx
fi

# Install certbot if not present
if ! command -v certbot &>/dev/null; then
  echo "Installing Certbot..."
  apt-get install -y certbot python3-certbot-nginx
fi

# Clone or update repo
APP_DIR="/opt/monolith-docs"
if [[ -d "${APP_DIR}/.git" ]]; then
  echo "Updating repo..."
  cd "${APP_DIR}"
  git pull --ff-only
else
  echo "Cloning repo..."
  git clone https://github.com/altus-labs-dev/monolith-docs.git "${APP_DIR}"
  cd "${APP_DIR}"
fi

# Load environment config
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "WARNING: No .env file found at ${ENV_FILE}"
  echo "Copy .env.example and configure before running docker compose."
  cp "${APP_DIR}/.env.example" "${ENV_FILE}"
fi

# Start services
echo "Starting services..."
cd "${APP_DIR}"
docker compose pull
docker compose up -d --build

echo "=== Startup complete $(date) ==="
echo "OnlyOffice: http://localhost:8080"
echo "API:        http://localhost:3020"
