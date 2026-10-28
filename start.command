#!/bin/bash
# Double-click to start Beast Island in Chrome
cd "$(dirname "$0")"
PORT=8124
# Stop an old game server that may still be running on this port
lsof -ti tcp:$PORT -sTCP:LISTEN | xargs kill 2>/dev/null
python3 server.py $PORT &
SERVER=$!
sleep 1
open -a "Google Chrome" "http://localhost:$PORT/?v=$(date +%s)"
echo "Beast Island is running at http://localhost:$PORT/"
echo "Keep this window open while you play. Close it to stop the game server."
wait $SERVER
