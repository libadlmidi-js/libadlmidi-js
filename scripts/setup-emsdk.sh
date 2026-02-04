#!/bin/bash
set -e

# Setup local Emscripten environment
EMSDK_DIR=".emsdk"
VERSION_FILE=".emsdk-version"

# Read version
if [ ! -f "$VERSION_FILE" ]; then
    echo "Error: $VERSION_FILE not found!"
    exit 1
fi
EMSDK_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

echo ">>> Setting up Emscripten SDK version: $EMSDK_VERSION"

# Clone if not exists
if [ ! -d "$EMSDK_DIR" ]; then
    echo ">>> Cloning emsdk repo..."
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi

cd "$EMSDK_DIR"

echo ">>> Fetching latest tags..."
git pull

echo ">>> Installing/Activating $EMSDK_VERSION..."
./emsdk install "$EMSDK_VERSION"
./emsdk activate "$EMSDK_VERSION"

echo ">>> Done! Local EMSDK is ready in $EMSDK_DIR"
echo ">>> Run 'source $EMSDK_DIR/emsdk_env.sh' to use it manually."
