#!/usr/bin/env bash
# Sets up Cloudflare Tunnel for Monolith Docs API endpoints.
#
# Prerequisites:
#   - cloudflared installed
#   - Authenticated to Cloudflare: cloudflared tunnel login
#
# Usage: ./setup-tunnel.sh

set -euo pipefail

TUNNEL_NAME="monolith-docs"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Cloudflare Tunnel Setup for Monolith Docs ==="

# Check prerequisites
if ! command -v cloudflared &>/dev/null; then
  echo "ERROR: cloudflared is not installed."
  echo "Install: curl -L https://pkg.cloudflare.com/cloudflared-stable-linux-amd64.deb -o /tmp/cloudflared.deb && dpkg -i /tmp/cloudflared.deb"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is not installed. Install: apt-get install -y jq"
  exit 1
fi

# Create the tunnel
echo "Creating tunnel '${TUNNEL_NAME}'..."
cloudflared tunnel create "${TUNNEL_NAME}"

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"${TUNNEL_NAME}\") | .id")
if [[ -z "${TUNNEL_ID}" ]]; then
  echo "ERROR: Failed to get tunnel ID"
  exit 1
fi
echo "Tunnel ID: ${TUNNEL_ID}"

# Set up credentials directory
sudo mkdir -p /etc/cloudflared
sudo cp "${HOME}/.cloudflared/${TUNNEL_ID}.json" "/etc/cloudflared/${TUNNEL_ID}.json"

# Generate config from template
sed "s/<TUNNEL_ID>/${TUNNEL_ID}/g" "${SCRIPT_DIR}/tunnel-config.yml" | sudo tee /etc/cloudflared/config.yml > /dev/null
echo "Config written to /etc/cloudflared/config.yml"

# Route DNS
echo "Creating DNS records..."
cloudflared tunnel route dns "${TUNNEL_NAME}" connect.monolithdocs.com
cloudflared tunnel route dns "${TUNNEL_NAME}" crm.monolithdocs.com
echo "DNS records created (CNAME → ${TUNNEL_ID}.cfargotunnel.com)"

# Install as systemd service
echo "Installing cloudflared as systemd service..."
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

echo ""
echo "=== Tunnel Setup Complete ==="
echo "Tunnel:    ${TUNNEL_NAME} (${TUNNEL_ID})"
echo "Endpoints:"
echo "  connect.monolithdocs.com → localhost:3020"
echo "  crm.monolithdocs.com     → localhost:3020"
echo ""
echo "Verify with:"
echo "  cloudflared tunnel info ${TUNNEL_NAME}"
echo "  systemctl status cloudflared"
echo "  curl -H 'Host: connect.monolithdocs.com' http://localhost:3020/health"
