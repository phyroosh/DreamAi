#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Starting DreamAi Bot VPS Setup Script"
echo "=========================================="

echo "[1/4] Installing Node.js (v20) and Git..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

echo "[2/4] Installing NPM dependencies..."
npm install

echo "[3/4] Installing PM2 (Process Manager)..."
sudo npm install -g pm2

echo "[4/4] Starting the Bot 24/7..."
pm2 start src/server.js --name "afk-bot"
pm2 save

echo "=========================================="
echo "✅ Setup Complete! The bot is now running."
echo "   To view live logs, type: pm2 logs afk-bot"
echo "=========================================="
echo ""
echo "Note: To make sure the bot restarts if the server reboots, run:"
echo "pm2 startup"
echo "(and follow the instructions it prints on the screen)"
