#!/bin/bash
set -e

# libADLMIDI-JS Build Script
# Uses Docker emscripten/emsdk for WASM compilation with ccache support

# Initialize submodule if not already done
if [ ! -d "libADLMIDI/.git" ] && [ ! -f "libADLMIDI/.git" ]; then
    echo ">>> Initializing libADLMIDI submodule..."
    git submodule update --init --recursive libADLMIDI
fi

# Ensure ccache dir exists on host so it persists
mkdir -p .ccache

echo ">>> Starting Docker build container..."

# Capture host UID/GID to use inside container
HOST_UID=$(id -u)
HOST_GID=$(id -g)

# We run as root initially to install ccache, then switch to user
# Note: we pass user ID/GID to create a matching user inside container
docker run --rm \
    -v "$(pwd)":/src \
    -w /src \
    emscripten/emsdk:latest \
    bash -c "
        set -e
        echo '>>> Installing ccache...'
        apt-get update -qq && apt-get install -yqq ccache

        # Determine user to run as
        if [ \"$HOST_UID\" -ne 0 ]; then
            # Check if user with this UID already exists
            if getent passwd \"$HOST_UID\" >/dev/null; then
                BUILD_USER=\$(getent passwd \"$HOST_UID\" | cut -d: -f1)
                echo \">>> Using existing user: \$BUILD_USER (UID $HOST_UID)\"
            else
                echo \">>> Creating new user for UID $HOST_UID...\"
                # Ensure group exists
                if ! getent group \"$HOST_GID\" >/dev/null; then
                    groupadd -g \"$HOST_GID\" builder
                fi
                
                # Create user 'builder'
                # We use the existing group ID (either pre-existing or just created)
                useradd -u \"$HOST_UID\" -g \"$HOST_GID\" -m builder
                BUILD_USER=builder
            fi
            
            # Switch to builder user and run the internal script
            # Pass arguments through (use bash explicitly)
            su \"\$BUILD_USER\" -s /bin/bash -c '. /emsdk/emsdk_env.sh && ./scripts/build-docker-inner.sh \"\$1\" \"\$2\"' -- \"\$1\" \"\$2\"
        else
            # Running as root (e.g. in some CI envs)
            . /emsdk/emsdk_env.sh
            ./scripts/build-docker-inner.sh \"\$1\" \"\$2\"
        fi
    " -- "$1" "$2"

echo ">>> Build complete!"
