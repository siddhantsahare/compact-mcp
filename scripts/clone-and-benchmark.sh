#!/bin/bash
# Clone excalidraw (shallow, no history) and benchmark compact_map against it.
# Run from the react-preprocessor-js directory.

set -e

REPO_DIR="/tmp/excalidraw-benchmark"

echo "📦 Cloning excalidraw (shallow)..."
if [ -d "$REPO_DIR" ]; then
  echo "   Already cloned at $REPO_DIR — skipping clone."
else
  git clone --depth 1 https://github.com/excalidraw/excalidraw "$REPO_DIR"
fi

echo ""
echo "🔨 Building MCP tools..."
npm run build:mcp

echo ""
echo "🚀 Running benchmark against excalidraw/packages/excalidraw/src..."
node scripts/benchmark-mcp.mjs "$REPO_DIR" packages/excalidraw/src
