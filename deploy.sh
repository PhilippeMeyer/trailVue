#!/bin/bash

# CONFIGURATION
# Override any of these in a git-ignored deploy.conf next to this script,
# or via the environment: PI_HOST=pi.local ./deploy.sh
[ -f "$(dirname "$0")/deploy.conf" ] && . "$(dirname "$0")/deploy.conf"

PI_USER="${PI_USER:-pi}"
PI_HOST="${PI_HOST:?set PI_HOST in deploy.conf or the environment}"
DEPLOY_DIR="${DEPLOY_DIR:-/srv/appservers/trailVue}"
# Staging area on the Pi. The server and client trees are siblings, never one
# inside the other: a --delete rsync into the parent would wipe the other tree,
# so the only thing keeping them both alive would be the order of the two rsync
# calls below.
TMP_ROOT="/tmp/trailVue"
TMP_SERVER_DIR="$TMP_ROOT/server"
TMP_REACT_DIR="$TMP_ROOT/client-build"
REACT_BUILD_DIR="./frontend/build"
NODE_SRC_DIR="./backend"
APP_USER="${APP_USER:-appservers}"
# Must match the existing pm2 process name, or a duplicate is started that
# fights the running one for port 5000.
PM2_NAME="${PM2_NAME:-trailvue}"

# 1. Optional: Build React client
echo "🔨 Building React app..."
cd frontend || exit 1
npm run build || { echo "❌ React build failed"; exit 1; }
cd ..

# 2. Clear the staging area, so nothing from a previous run - or a previous
# directory layout - can be copied into the live deploy.
# rsync creates only the last path component, so both trees are made here.
ssh "$PI_USER@$PI_HOST" "rm -rf '$TMP_ROOT' && mkdir -p '$TMP_SERVER_DIR' '$TMP_REACT_DIR'" \
  || { echo "❌ Could not prepare staging on the Pi"; exit 1; }

# 3. Deploy Node backend to Pi (excluding node_modules and the tour data)
# gpx/ is the server's own data directory: tours downloaded on the Pi via
# /api/update live only there, so it is never pushed or overwritten from here.
echo "🚀 Syncing Node server to Pi..."
rsync -avz --delete --exclude node_modules --exclude gpx "$NODE_SRC_DIR/" "$PI_USER@$PI_HOST:$TMP_SERVER_DIR" \
  || { echo "❌ Server sync failed"; exit 1; }

# 4. Deploy React app to Apache on Pi
echo "🚀 Syncing React build to Pi Apache server..."
rsync -avz --delete "$REACT_BUILD_DIR/" "$PI_USER@$PI_HOST:$TMP_REACT_DIR" \
  || { echo "❌ Client sync failed"; exit 1; }

# 5. Connecting to the Pi to copy the files to the target location and change user
ssh $PI_USER@$PI_HOST <<EOF || { echo "❌ Install on the Pi failed"; exit 1; }
set -e
# Never wipe a working deploy on the strength of an incomplete staging area.
[ -f "$TMP_SERVER_DIR/index.js" ] || { echo "❌ staged server is missing index.js"; exit 1; }
[ -f "$TMP_REACT_DIR/index.html" ] || { echo "❌ staged client is missing index.html"; exit 1; }
sudo mkdir -p $DEPLOY_DIR
# Replace the deployed code, but keep gpx/ (downloaded tours) and .env (the
# Pi's own credentials) — both are server-side state, not build output.
sudo find $DEPLOY_DIR -mindepth 1 -maxdepth 1 ! -name gpx ! -name .env -exec rm -rf {} +
# '/.' rather than '/*' so dotfiles are copied too.
sudo cp -r $TMP_SERVER_DIR/. $DEPLOY_DIR/
sudo mkdir -p $DEPLOY_DIR/client-build
sudo cp -r $TMP_REACT_DIR/. $DEPLOY_DIR/client-build/
sudo mkdir -p $DEPLOY_DIR/gpx
sudo chown -R $APP_USER:$APP_USER $DEPLOY_DIR/
EOF

# 6. Install backend dependencies and restart server on the Pi
echo "🔁 Installing server dependencies and restarting with pm2..."
ssh "$PI_USER@$PI_HOST" << EOF || { echo "❌ pm2 restart failed"; exit 1; }
sudo -u $APP_USER bash -c '
  set -e
  cd $DEPLOY_DIR
  npm install
  if pm2 describe $PM2_NAME > /dev/null 2>&1; then
    pm2 restart $PM2_NAME --update-env
  else
    pm2 start index.js --name $PM2_NAME
  fi
  pm2 save
'
EOF

echo "✅ Deployment complete!"
