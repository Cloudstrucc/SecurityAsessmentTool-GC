#!/bin/sh
# Copy the most recent in-browser screenshot into this folder under a stable name.
#   sh docs/demo-screenshots/snap.sh 01-dashboard-new-project
BLOBS="/Users/frederickpearson/.claude/projects/-Users-frederickpearson-repos-SecurityAssessmentTool/29513823-0b41-43fc-8efc-9f589394b6e0/tool-results"
DEST="$(cd "$(dirname "$0")" && pwd)"
latest=$(ls -t "$BLOBS"/mcp-claude-in-chrome-blob-*.jpg 2>/dev/null | head -1)
[ -z "$latest" ] && { echo "no screenshot blob found"; exit 1; }
cp "$latest" "$DEST/$1.jpg" && echo "saved $1.jpg  <- $(basename "$latest")"
