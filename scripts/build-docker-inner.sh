#!/bin/bash
set -e

# Internal build script running inside Docker
# Usage: ./scripts/build-docker-inner.sh <build_arg> <slim_arg>

BUILD_ARG="${1:-all}"
SLIM_ARG="$2"

# Configure ccache
export CCACHE_DIR=/src/.ccache
export CCACHE_MAXSIZE=500M
export CCACHE_SLOPPINESS=pch_defines,time_macros

# Ensure ccache dir exists and has correct permissions (if created by root)
mkdir -p "$CCACHE_DIR"

EMCC_EXPORT_FUNCS="['_adl_init','_adl_close','_adl_generate','_adl_generateFormat','_adl_play','_adl_playFormat','_adl_rt_noteOn','_adl_rt_noteOff','_adl_rt_pitchBend','_adl_rt_pitchBendML','_adl_rt_controllerChange','_adl_rt_patchChange','_adl_rt_resetState','_adl_panic','_adl_openData','_adl_openBankData','_adl_openBankFile','_adl_setBank','_adl_getBanksCount','_adl_getBankNames','_adl_reset','_adl_setNumChips','_adl_setNumFourOpsChn','_adl_getNumFourOpsChn','_adl_setVolumeRangeModel','_adl_switchEmulator','_adl_chipEmulatorName','_adl_setLoopEnabled','_adl_setLoopCount','_adl_setPercMode','_adl_setHVibrato','_adl_setHTremolo','_adl_setScaleModulators','_adl_setFullRangeBrightness','_adl_setAutoArpeggio','_adl_getAutoArpeggio','_adl_setChannelAllocMode','_adl_getChannelAllocMode','_adl_setSoftPanEnabled','_adl_setTempo','_adl_totalTimeLength','_adl_positionTell','_adl_positionSeek','_adl_positionRewind','_adl_atEnd','_adl_errorString','_adl_errorInfo','_adl_getBank','_adl_getInstrument','_adl_setInstrument','_adl_loadEmbeddedBank','_adl_reserveBanks','_adl_getNumChips','_adl_getNumChipsObtained','_adl_getVolumeRangeModel','_adl_setRunAtPcmRate','_adl_rt_bankChange','_adl_rt_bankChangeMSB','_adl_rt_bankChangeLSB','_adl_rt_noteAfterTouch','_adl_rt_channelAfterTouch','_adl_metaMusicTitle','_adl_metaMusicCopyright','_malloc','_free']"

EMCC_RUNTIME_METHODS="['ccall','cwrap','getValue','setValue','HEAP8','HEAP16','HEAP32','HEAPU8','HEAPU16','HEAPU32','UTF8ToString']"

# Emulator profiles: "Name | CMake flags"
EMULATOR_PROFILES=(
    "nuked|-DUSE_NUKED_EMULATOR=ON -DUSE_DOSBOX_EMULATOR=OFF -DUSE_OPAL_EMULATOR=OFF -DUSE_JAVA_EMULATOR=OFF -DUSE_ESFMU_EMULATOR=OFF -DUSE_MAME_EMULATOR=OFF -DUSE_YMFM_EMULATOR=OFF"
    "dosbox|-DUSE_NUKED_EMULATOR=OFF -DUSE_DOSBOX_EMULATOR=ON -DUSE_OPAL_EMULATOR=OFF -DUSE_JAVA_EMULATOR=OFF -DUSE_ESFMU_EMULATOR=OFF -DUSE_MAME_EMULATOR=OFF -DUSE_YMFM_EMULATOR=OFF"
    "light|-DUSE_NUKED_EMULATOR=ON -DUSE_DOSBOX_EMULATOR=ON -DUSE_OPAL_EMULATOR=OFF -DUSE_JAVA_EMULATOR=OFF -DUSE_ESFMU_EMULATOR=OFF -DUSE_MAME_EMULATOR=OFF -DUSE_YMFM_EMULATOR=OFF"
    "full|-DUSE_NUKED_EMULATOR=ON -DUSE_DOSBOX_EMULATOR=ON -DUSE_OPAL_EMULATOR=ON -DUSE_JAVA_EMULATOR=ON -DUSE_ESFMU_EMULATOR=ON -DUSE_MAME_EMULATOR=ON -DUSE_YMFM_EMULATOR=ON"
)

build_profile() {
    local EMU_NAME=$1
    local EMU_FLAGS=$2
    local WITH_BANKS=$3 # "ON" or "OFF"

    local SUFFIX=""
    local BANKS_FLAG="-DWITH_EMBEDDED_BANKS=ON"
    if [ "$WITH_BANKS" = "OFF" ]; then
        SUFFIX=".slim"
        BANKS_FLAG="-DWITH_EMBEDDED_BANKS=OFF"
    fi

    local OUTPUT_NAME="${EMU_NAME}${SUFFIX}"
    local BUILD_DIR="build-${OUTPUT_NAME}"

    echo ">>> Building: $OUTPUT_NAME (banks=$WITH_BANKS)"

    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    if [ ! -f Makefile ]; then
        echo '>>> Configuring with emcmake...'
        # Use ccache as compiler launcher
        # shellcheck disable=SC2086
        emcmake cmake ../libADLMIDI \
            -DCMAKE_C_COMPILER_LAUNCHER=ccache \
            -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
            -DCMAKE_BUILD_TYPE=MinSizeRel \
            -DlibADLMIDI_SHARED=OFF \
            -DlibADLMIDI_STATIC=ON \
            -DWITH_MIDI_SEQUENCER=ON \
            $BANKS_FLAG \
            $EMU_FLAGS
    fi

    echo '>>> Building with emmake...'
    emmake make -j"$(nproc)"

    EXPORTS="$EMCC_EXPORT_FUNCS"
    RUNTIME="$EMCC_RUNTIME_METHODS"

    echo '>>> Linking BUNDLED version...'
    emcc -Oz -flto -s WASM=1 -s SINGLE_FILE=1 -s BINARYEN_ASYNC_COMPILATION=0 \
        -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 \
        -s ENVIRONMENT=web,worker -s TEXTDECODER=1 \
        -s EXPORT_NAME=createADLMIDI \
        -s EXPORTED_FUNCTIONS="$EXPORTS" \
        -s EXPORTED_RUNTIME_METHODS="$RUNTIME" \
        libADLMIDI.a -o ../dist/libadlmidi."$OUTPUT_NAME".js

    echo '>>> Linking SPLIT version (browser-only, for processor bundles)...'
    emcc -Oz -flto -s WASM=1 -s SINGLE_FILE=0 \
        -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 \
        -s ENVIRONMENT=web,worker -s TEXTDECODER=1 \
        -s EXPORT_NAME=createADLMIDI \
        -s EXPORTED_FUNCTIONS="$EXPORTS" \
        -s EXPORTED_RUNTIME_METHODS="$RUNTIME" \
        libADLMIDI.a -o ../dist/libadlmidi."$OUTPUT_NAME".browser.js

    echo '>>> Linking SPLIT version (with Node support, for AdlMidiCore)...'
    emcc -Oz -flto -s WASM=1 -s SINGLE_FILE=0 \
        -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 \
        -s ENVIRONMENT=web,worker,node \
        -s EXPORT_NAME=createADLMIDI \
        -s EXPORTED_FUNCTIONS="$EXPORTS" \
        -s EXPORTED_RUNTIME_METHODS="$RUNTIME" \
        libADLMIDI.a -o ../dist/libadlmidi."$OUTPUT_NAME".core.js

    cd ..

    echo ">>> Built $OUTPUT_NAME"
}

# Main execution logic
mkdir -p dist

if [ "$BUILD_ARG" = "all" ]; then
    for profile in "${EMULATOR_PROFILES[@]}"; do
        IFS="|" read -r name flags <<<"$profile"
        build_profile "$name" "$flags" "ON"
        build_profile "$name" "$flags" "OFF"
    done
elif [ -n "$BUILD_ARG" ]; then
    for profile in "${EMULATOR_PROFILES[@]}"; do
        IFS="|" read -r name flags <<<"$profile"
        if [ "$name" == "$BUILD_ARG" ]; then
            if [ "$SLIM_ARG" = "slim" ]; then
                build_profile "$name" "$flags" "OFF"
            else
                build_profile "$name" "$flags" "ON"
                build_profile "$name" "$flags" "OFF"
            fi
            exit 0
        fi
    done
    echo "Profile '$BUILD_ARG' not found!"
    exit 1
fi

# Show ccache stats
echo ">>> ccache statistics:"
ccache -s
