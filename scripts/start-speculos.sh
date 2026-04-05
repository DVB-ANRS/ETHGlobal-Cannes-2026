#!/bin/bash
# Launch Speculos emulator with the Ethereum app (Nano S Plus)
# Requires: Docker running, .elf file in speculos-apps/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ELF_DIR="$PROJECT_DIR/speculos-apps"
ELF_FILE="$ELF_DIR/ethereum-nanosp.elf"

if [ ! -f "$ELF_FILE" ]; then
  echo "ERROR: $ELF_FILE not found"
  echo "Download it from LedgerHQ/app-ethereum CI artifacts"
  exit 1
fi

echo "Starting Speculos (Nano S Plus + Ethereum app)..."
echo "  APDU port: 40000"
echo "  API  port: 5001"
echo "  Model:     nanosp"
echo "  Seed:      abandon x11 + about"
echo ""

docker run --rm -it \
  -v "$ELF_DIR":/speculos/apps \
  -p 5001:5001 \
  -p 40000:40000 \
  ghcr.io/ledgerhq/speculos \
  --model nanosp \
  --display headless \
  --apdu-port 40000 \
  --api-port 5001 \
  --seed "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about" \
  apps/ethereum-nanosp.elf
