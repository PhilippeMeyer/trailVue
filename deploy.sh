#!/bin/bash

# CONFIGURATION
# Override any of these in a git-ignored deploy.conf next to this script,
# or via the environment: PI_HOST=pi.local ./deploy.sh
[ -f "$(dirname "$0")/deploy.conf" ] && . "$(dirname "$0")/deploy.conf"

PI_USER="${PI_USER:-pi}"
PI_HOST="${PI_HOST:?set PI_HOST in deploy.conf or the environment}"
DEPLOY_DIR="${DEPLOY_DIR:-/srv/appservers/trailVue}"
TMP_DIR="/tmp/trailVue"
TMP_REACT_DIR="/tmp/trailVue/client-build"
REACT_BUILD_DIR="./frontend/build"
NODE_SRC_DIR="./backend"
APP_USER="${APP_USER:-appservers}"

# 1. Optional: Build React client
echo "🔨 Building React app..."
cd frontend || exit 1
npm run build || { echo "❌ React build failed"; exit 1; }
cd ..

# 2. Deploy Node backend to Pi (excluding node_modules)
echo "🚀 Syncing Node server to Pi..."
rsync -avz --delete --exclude node_modules "$NODE_SRC_DIR/" "$PI_USER@$PI_HOST:$TMP_DIR"

# 3. Deploy React app to Apache on Pi
echo "🚀 Syncing React build to Pi Apache server..."
rsync -avz --delete "$REACT_BUILD_DIR/" "$PI_USER@$PI_HOST:$TMP_REACT_DIR"

# 4. Connecting to the Pi to copy the files to the target location and change user
ssh $PI_USER@$PI_HOST <<EOF
sudo mkdir -p $DEPLOY_DIR
sudo find $DEPLOY_DIR -mindepth 1 -delete
sudo cp -r $TMP_DIR/* $DEPLOY_DIR/
sudo chown -R $APP_USER:$APP_USER $DEPLOY_DIR/
EOF

# 5. Install backend dependencies and restart server on the Pi
echo "🔁 Installing server dependencies and restarting with pm2..."
ssh "$PI_USER@$PI_HOST" << EOF
sudo -u $APP_USER bash -c '
  cd $DEPLOY_DIR &&
  npm install &&
  pm2 restart trailVue || pm2 start index.js --name trailVue &&
  pm2 save
'
EOF

echo "✅ Deployment complete!"
