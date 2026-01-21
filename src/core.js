/**
 * AdlMidiCore - Low-level platform-agnostic synthesis interface
 *
 * Provides direct access to libADLMIDI WASM for use cases that don't need
 * WebAudio/AudioWorklet integration (e.g., Node.js batch rendering,
 * custom audio backends, game engines).
 *
 * @module core
 */

import {
    SIZEOF_ADL_INSTRUMENT,
    SIZEOF_ADL_BANK_ID,
    SIZEOF_ADL_BANK,
    decodeInstrument,
    encodeInstrument,
} from './utils/struct.js';

/**
 * Low-level OPL3 synthesis interface.
 *
 * Unlike AdlMidi (which manages AudioWorklet), AdlMidiCore works directly
 * with the WASM module and returns raw audio samples.
 *
 * @example
 * ```javascript
 * import { AdlMidiCore } from 'libadlmidi-js/core';
 *
 * // Load with specific WASM profile
 * const synth = await AdlMidiCore.create({
 *   corePath: './node_modules/libadlmidi-js/dist/libadlmidi.nuked.core.js'
 * });
 *
 * await synth.init(44100);
 * synth.setBank(72);
 * synth.noteOn(0, 60, 100);
 *
 * // Generate audio
 * const samples = synth.generate(4096);  // Float32Array, stereo interleaved
 *
 * synth.close();
 * ```
 */
export class AdlMidiCore {
    /**
     * Create a new AdlMidiCore instance.
     *
     * @param {Object} options
     * @param {string} options.corePath - Path to the .core.js WASM loader module
     * @param {ArrayBuffer} [options.wasmBinary] - Pre-loaded WASM binary (optional)
     * @returns {Promise<AdlMidiCore>}
     */
    static async create(options) {
        if (!options?.corePath) {
            throw new Error('AdlMidiCore.create requires corePath option');
        }

        const core = new AdlMidiCore();

        // Dynamically import the WASM loader module
        const { default: createADLMIDI } = await import(options.corePath);

        // Initialize the Emscripten module
        const moduleConfig = options.wasmBinary
            ? { wasmBinary: options.wasmBinary }
            : undefined;

        core._module = await createADLMIDI(moduleConfig);
        core._player = null;
        core._sampleRate = 44100;
        core._audioBuffer = null;
        core._audioBufferPtr = null;

        return core;
    }

    constructor() {
        /** @private @type {any} */
        this._module = null;
        /** @private @type {number|null} */
        this._player = null;
        /** @private @type {number} */
        this._sampleRate = 44100;
        /** @private @type {Float32Array|null} */
        this._audioBuffer = null;
        /** @private @type {number|null} */
        this._audioBufferPtr = null;
    }

    /**
     * Initialize the synthesizer.
     *
     * @param {number} [sampleRate=44100] - Audio sample rate
     * @returns {boolean} True if successful
     */
    init(sampleRate = 44100) {
        if (!this._module) {
            throw new Error('AdlMidiCore not initialized - use AdlMidiCore.create()');
        }

        this._sampleRate = sampleRate;
        this._player = this._module._adl_init(sampleRate);

        if (!this._player) {
            throw new Error('Failed to initialize ADL MIDI player');
        }

        return true;
    }

    /**
     * Close the synthesizer and free resources.
     */
    close() {
        if (this._audioBufferPtr) {
            this._module._free(this._audioBufferPtr);
            this._audioBufferPtr = null;
            this._audioBuffer = null;
        }

        if (this._player) {
            this._module._adl_close(this._player);
            this._player = null;
        }
    }

    /**
     * Reset the synthesizer state (stop all notes).
     */
    reset() {
        this._ensurePlayer();
        this._module._adl_rt_resetState(this._player);
    }

    /**
     * Full reset to apply instrument/bank changes.
     */
    resetFull() {
        this._ensurePlayer();
        this._module._adl_reset(this._player);
    }

    /**
     * Panic - immediately stop all notes.
     */
    panic() {
        this._ensurePlayer();
        this._module._adl_panic(this._player);
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    /**
     * Set the FM bank by index.
     *
     * @param {number} bank - Bank index (0-72+ depending on build)
     * @returns {boolean} True if successful
     */
    setBank(bank) {
        this._ensurePlayer();
        return this._module._adl_setBank(this._player, bank) === 0;
    }

    /**
     * Load a custom WOPL bank from data.
     *
     * @param {ArrayBuffer|Uint8Array} data - WOPL bank data
     * @returns {boolean} True if successful
     */
    loadBankData(data) {
        this._ensurePlayer();
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

        const ptr = this._module._malloc(bytes.length);
        this._module.HEAPU8.set(bytes, ptr);

        const result = this._module._adl_openBankData(this._player, ptr, bytes.length);

        this._module._free(ptr);
        return result === 0;
    }

    /**
     * Get the number of available embedded banks.
     *
     * @returns {number} Number of banks
     */
    getBankCount() {
        return this._module._adl_getBanksCount();
    }

    /**
     * Get list of embedded banks with their names.
     *
     * @returns {{id: number, name: string}[]} Array of bank info objects
     */
    getEmbeddedBanks() {
        const count = this._module._adl_getBanksCount();
        const namesPtr = this._module._adl_getBankNames();
        const banks = [];

        for (let i = 0; i < count; i++) {
            const strPtr = this._module.getValue(namesPtr + i * 4, 'i32');
            const name = strPtr ? this._module.UTF8ToString(strPtr) : `Bank ${i}`;
            banks.push({ id: i, name });
        }

        return banks;
    }

    /**
     * Set the number of emulated OPL3 chips.
     *
     * @param {number} count - Number of chips (1-100)
     * @returns {boolean} True if successful
     */
    setNumChips(count) {
        this._ensurePlayer();
        return this._module._adl_setNumChips(this._player, count) === 0;
    }

    /**
     * Set the number of 4-operator channels.
     *
     * @param {number} count - Number of channels (-1 for auto)
     * @returns {boolean} True if successful
     */
    setNumFourOpChannels(count) {
        this._ensurePlayer();
        return this._module._adl_setNumFourOpsChn(this._player, count) === 0;
    }

    /**
     * Get the number of 4-operator channels.
     *
     * @returns {number} Count of channels
     */
    getNumFourOpChannels() {
        this._ensurePlayer();
        return this._module._adl_getNumFourOpsChn(this._player);
    }

    /**
     * Enable/disable scaling of modulators by volume.
     *
     * @param {boolean} enabled
     */
    setScaleModulators(enabled) {
        this._ensurePlayer();
        this._module._adl_setScaleModulators(this._player, enabled ? 1 : 0);
    }

    /**
     * Enable/disable full-range brightness (0-127).
     *
     * @param {boolean} enabled
     */
    setFullRangeBrightness(enabled) {
        this._ensurePlayer();
        this._module._adl_setFullRangeBrightness(this._player, enabled ? 1 : 0);
    }

    /**
     * Enable/disable automatic arpeggio.
     *
     * @param {boolean} enabled
     */
    setAutoArpeggio(enabled) {
        this._ensurePlayer();
        this._module._adl_setAutoArpeggio(this._player, enabled ? 1 : 0);
    }

    /**
     * Get automatic arpeggio state.
     *
     * @returns {boolean}
     */
    getAutoArpeggio() {
        this._ensurePlayer();
        return this._module._adl_getAutoArpeggio(this._player) !== 0;
    }

    /**
     * Set channel allocation mode.
     *
     * @param {number} mode - Mode ID
     */
    setChannelAllocMode(mode) {
        this._ensurePlayer();
        this._module._adl_setChannelAllocMode(this._player, mode);
    }

    /**
     * Get channel allocation mode.
     *
     * @returns {number} Mode ID
     */
    getChannelAllocMode() {
        this._ensurePlayer();
        return this._module._adl_getChannelAllocMode(this._player);
    }

    /**
     * Enable/disable soft stereo panning.
     *
     * @param {boolean} enabled
     */
    setSoftPan(enabled) {
        this._ensurePlayer();
        this._module._adl_setSoftPanEnabled(this._player, enabled ? 1 : 0);
    }

    /**
     * Enable/disable deep vibrato.
     *
     * @param {boolean} enabled
     */
    setDeepVibrato(enabled) {
        this._ensurePlayer();
        this._module._adl_setHVibrato(this._player, enabled ? 1 : 0);
    }

    /**
     * Enable/disable deep tremolo.
     *
     * @param {boolean} enabled
     */
    setDeepTremolo(enabled) {
        this._ensurePlayer();
        this._module._adl_setHTremolo(this._player, enabled ? 1 : 0);
    }

    /**
     * Switch OPL3 emulator (if multiple are compiled in).
     *
     * @param {number} emulator - Emulator ID (0=Nuked, 2=DosBox, etc.)
     * @returns {boolean} True if successful
     */
    switchEmulator(emulator) {
        this._ensurePlayer();
        return this._module._adl_switchEmulator(this._player, emulator) === 0;
    }

    /**
     * Get the current chip emulator name.
     *
     * @returns {string} Emulator name
     */
    getEmulatorName() {
        this._ensurePlayer();
        const ptr = this._module._adl_chipEmulatorName(this._player);
        return this._module.UTF8ToString(ptr);
    }

    /**
     * Get the version string of the linked libADLMIDI library.
     *
     * @returns {string} Version string (e.g., "1.5.1")
     */
    getLibraryVersion() {
        const ptr = this._module._adl_linkedLibraryVersion();
        return this._module.UTF8ToString(ptr);
    }

    /**
     * Get the version of the linked libADLMIDI library as an object.
     *
     * @returns {{major: number, minor: number, patch: number}}
     */
    getVersion() {
        const ptr = this._module._adl_linkedVersion();
        return {
            major: this._module.getValue(ptr, 'i16'),
            minor: this._module.getValue(ptr + 2, 'i16'),
            patch: this._module.getValue(ptr + 4, 'i16')
        };
    }

    /**
     * Get the number of emulated chips.
     *
     * @returns {number}
     */
    getNumChips() {
        this._ensurePlayer();
        return this._module._adl_getNumChips(this._player);
    }

    /**
     * Get the number of emulated chips obtained.
     *
     * @returns {number}
     */
    getNumChipsObtained() {
        this._ensurePlayer();
        return this._module._adl_getNumChipsObtained(this._player);
    }

    /**
     * Get the volume range model.
     *
     * @returns {number}
     */
    getVolumeModel() {
        this._ensurePlayer();
        return this._module._adl_getVolumeRangeModel(this._player);
    }

    /**
     * Set the volume range model.
     *
     * @param {number} model - Volume model type
     */
    setVolumeModel(model) {
        this._ensurePlayer();
        this._module._adl_setVolumeRangeModel(this._player, model);
    }

    /**
     * Run emulator with PCM rate to reduce CPU usage.
     *
     * @param {boolean} enabled
     * @returns {boolean} True if successful
     */
    setRunAtPcmRate(enabled) {
        this._ensurePlayer();
        return this._module._adl_setRunAtPcmRate(this._player, enabled ? 1 : 0) === 0;
    }

    // =========================================================================
    // Real-time Synthesis
    // =========================================================================

    /**
     * Trigger a note on.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - MIDI note (0-127)
     * @param {number} velocity - Velocity (0-127)
     */
    noteOn(channel, note, velocity) {
        this._ensurePlayer();
        this._module._adl_rt_noteOn(this._player, channel, note, velocity);
    }

    /**
     * Trigger a note off.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - MIDI note (0-127)
     */
    noteOff(channel, note) {
        this._ensurePlayer();
        this._module._adl_rt_noteOff(this._player, channel, note);
    }

    /**
     * Send a note aftertouch message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - MIDI note (0-127)
     * @param {number} pressure - Aftertouch pressure (0-127)
     */
    noteAfterTouch(channel, note, pressure) {
        this._ensurePlayer();
        this._module._adl_rt_noteAfterTouch(this._player, channel, note, pressure);
    }

    /**
     * Send a channel aftertouch message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} pressure - Aftertouch pressure (0-127)
     */
    channelAfterTouch(channel, pressure) {
        this._ensurePlayer();
        this._module._adl_rt_channelAfterTouch(this._player, channel, pressure);
    }

    /**
     * Send a pitch bend message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} value - Pitch bend value (0-16383, 8192 = center)
     */
    pitchBend(channel, value) {
        this._ensurePlayer();
        this._module._adl_rt_pitchBend(this._player, channel, value);
    }

    /**
     * Send a controller change message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} controller - Controller number (0-127)
     * @param {number} value - Controller value (0-127)
     */
    controllerChange(channel, controller, value) {
        this._ensurePlayer();
        this._module._adl_rt_controllerChange(this._player, channel, controller, value);
    }

    /**
     * Send a program change message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} program - Program number (0-127)
     */
    programChange(channel, program) {
        this._ensurePlayer();
        this._module._adl_rt_patchChange(this._player, channel, program);
    }

    /**
     * Send a bank change message (16-bit).
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} bank - Bank number
     */
    bankChange(channel, bank) {
        this._ensurePlayer();
        this._module._adl_rt_bankChange(this._player, channel, bank);
    }

    /**
     * Send a bank change MSB message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} msb - Bank MSB (0-127)
     */
    bankChangeMSB(channel, msb) {
        this._ensurePlayer();
        this._module._adl_rt_bankChangeMSB(this._player, channel, msb);
    }

    /**
     * Send a bank change LSB message.
     *
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} lsb - Bank LSB (0-127)
     */
    bankChangeLSB(channel, lsb) {
        this._ensurePlayer();
        this._module._adl_rt_bankChangeLSB(this._player, channel, lsb);
    }

    /**
     * Generate audio samples (real-time synthesis).
     *
     * @param {number} frames - Number of stereo frames to generate
     * @returns {Float32Array} Stereo interleaved audio samples (-1 to +1)
     */
    generate(frames) {
        this._ensurePlayer();

        const samples = frames * 2; // Stereo
        const bytes = samples * 2;  // Int16

        // Allocate/reuse buffer
        if (!this._audioBufferPtr || !this._audioBuffer || this._audioBuffer.length < samples) {
            if (this._audioBufferPtr) {
                this._module._free(this._audioBufferPtr);
            }
            this._audioBufferPtr = this._module._malloc(bytes);
            this._audioBuffer = new Float32Array(samples);
        }

        // Generate audio (Int16 output)
        this._module._adl_generate(this._player, samples, this._audioBufferPtr);

        // Convert Int16 to Float32
        const heap16 = this._module.HEAP16;
        const offset = /** @type {number} */ (this._audioBufferPtr) >> 1; // Byte offset to Int16 offset
        for (let i = 0; i < samples; i++) {
            /** @type {Float32Array} */ (this._audioBuffer)[i] = heap16[offset + i] / 32768;
        }

        return /** @type {Float32Array} */ (this._audioBuffer).slice(0, samples);
    }

    // =========================================================================
    // MIDI File Playback
    // =========================================================================

    /**
     * Load a MIDI file from data.
     *
     * @param {ArrayBuffer|Uint8Array} data - MIDI file data
     * @returns {boolean} True if successful
     */
    loadMidi(data) {
        this._ensurePlayer();
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

        const ptr = this._module._malloc(bytes.length);
        this._module.HEAPU8.set(bytes, ptr);

        const result = this._module._adl_openData(this._player, ptr, bytes.length);

        this._module._free(ptr);
        return result === 0;
    }

    /**
     * Get the music title of the loaded MIDI file.
     *
     * @returns {string} Title or empty string
     */
    getMusicTitle() {
        this._ensurePlayer();
        const ptr = this._module._adl_metaMusicTitle(this._player);
        return ptr ? this._module.UTF8ToString(ptr) : '';
    }

    /**
     * Get the copyright notice of the loaded MIDI file.
     *
     * @returns {string} Copyright or empty string
     */
    getMusicCopyright() {
        this._ensurePlayer();
        const ptr = this._module._adl_metaMusicCopyright(this._player);
        return ptr ? this._module.UTF8ToString(ptr) : '';
    }

    /**
     * Play MIDI file and generate audio.
     *
     * @param {number} frames - Number of stereo frames to generate
     * @returns {Float32Array} Stereo interleaved audio samples (-1 to +1)
     */
    play(frames) {
        this._ensurePlayer();

        const samples = frames * 2;
        const bytes = samples * 2;

        if (!this._audioBufferPtr || !this._audioBuffer || this._audioBuffer.length < samples) {
            if (this._audioBufferPtr) {
                this._module._free(this._audioBufferPtr);
            }
            this._audioBufferPtr = this._module._malloc(bytes);
            this._audioBuffer = new Float32Array(samples);
        }

        this._module._adl_play(this._player, samples, this._audioBufferPtr);

        const heap16 = this._module.HEAP16;
        const offset = /** @type {number} */ (this._audioBufferPtr) >> 1;
        for (let i = 0; i < samples; i++) {
            /** @type {Float32Array} */ (this._audioBuffer)[i] = heap16[offset + i] / 32768;
        }

        return /** @type {Float32Array} */ (this._audioBuffer).slice(0, samples);
    }

    /**
     * Get the current playback position in seconds.
     *
     * @returns {number} Position in seconds
     */
    get position() {
        this._ensurePlayer();
        return this._module._adl_positionTell(this._player);
    }

    /**
     * Get the total duration in seconds.
     *
     * @returns {number} Duration in seconds
     */
    get duration() {
        this._ensurePlayer();
        return this._module._adl_totalTimeLength(this._player);
    }

    /**
     * Seek to a position.
     *
     * @param {number} seconds - Position in seconds
     */
    seek(seconds) {
        this._ensurePlayer();
        this._module._adl_positionSeek(this._player, seconds);
    }

    /**
     * Rewind to the beginning.
     */
    rewind() {
        this._ensurePlayer();
        this._module._adl_positionRewind(this._player);
    }

    /**
     * Check if playback has reached the end.
     *
     * @returns {boolean} True if at end
     */
    get atEnd() {
        this._ensurePlayer();
        return this._module._adl_atEnd(this._player) !== 0;
    }

    /**
     * Enable/disable looping.
     *
     * @param {boolean} enabled
     */
    setLooping(enabled) {
        this._ensurePlayer();
        this._module._adl_setLoopEnabled(this._player, enabled ? 1 : 0);
    }

    /**
     * Set playback tempo multiplier.
     *
     * @param {number} tempo - Tempo multiplier (1.0 = normal)
     */
    setTempo(tempo) {
        this._ensurePlayer();
        this._module._adl_setTempo(this._player, tempo);
    }

    // =========================================================================
    // Instrument Access
    // =========================================================================

    /**
     * Get an instrument from a bank.
     *
     * @param {Object} bankId - Bank identifier
     * @param {number} bankId.percussive - 0 for melodic, 1 for percussion
     * @param {number} bankId.msb - Bank MSB
     * @param {number} bankId.lsb - Bank LSB
     * @param {number} program - Program number (0-127)
     * @returns {import('./utils/struct.js').Instrument|null} Instrument or null if not found
     */
    getInstrument(bankId, program) {
        this._ensurePlayer();

        // Allocate bank ID struct
        const bankIdPtr = this._module._malloc(SIZEOF_ADL_BANK_ID);
        this._module.HEAPU8[bankIdPtr] = bankId.percussive || 0;
        this._module.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
        this._module.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;

        // Allocate bank struct
        const bankPtr = this._module._malloc(SIZEOF_ADL_BANK);

        // Get bank (create if needed)
        const bankResult = this._module._adl_getBank(this._player, bankIdPtr, 1, bankPtr);

        let instrument = null;
        if (bankResult === 0) {
            // Allocate instrument struct
            const instPtr = this._module._malloc(SIZEOF_ADL_INSTRUMENT);

            const result = this._module._adl_getInstrument(
                this._player,
                bankPtr,
                program,
                instPtr
            );

            if (result === 0) {
                const bytes = this._module.HEAPU8.slice(instPtr, instPtr + SIZEOF_ADL_INSTRUMENT);
                instrument = decodeInstrument(bytes);
            }

            this._module._free(instPtr);
        }

        this._module._free(bankIdPtr);
        this._module._free(bankPtr);

        return instrument;
    }

    /**
     * Set an instrument in a bank.
     *
     * @param {Object} bankId - Bank identifier
     * @param {number} bankId.percussive - 0 for melodic, 1 for percussion
     * @param {number} bankId.msb - Bank MSB
     * @param {number} bankId.lsb - Bank LSB
     * @param {number} program - Program number (0-127)
     * @param {import('./utils/struct.js').Instrument} instrument - Instrument to set
     * @returns {boolean} True if successful
     */
    setInstrument(bankId, program, instrument) {
        this._ensurePlayer();

        // Allocate bank ID struct
        const bankIdPtr = this._module._malloc(SIZEOF_ADL_BANK_ID);
        this._module.HEAPU8[bankIdPtr] = bankId.percussive || 0;
        this._module.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
        this._module.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;

        // Allocate bank struct
        const bankPtr = this._module._malloc(SIZEOF_ADL_BANK);

        // Get bank (create if needed)
        const bankResult = this._module._adl_getBank(this._player, bankIdPtr, 1, bankPtr);

        let success = false;
        if (bankResult === 0) {
            // Encode and write instrument
            const bytes = encodeInstrument(instrument);
            const instPtr = this._module._malloc(SIZEOF_ADL_INSTRUMENT);
            this._module.HEAPU8.set(bytes, instPtr);

            const result = this._module._adl_setInstrument(
                this._player,
                bankPtr,
                program,
                instPtr
            );

            success = result === 0;
            this._module._free(instPtr);
        }

        this._module._free(bankIdPtr);
        this._module._free(bankPtr);

        return success;
    }

    // =========================================================================
    // Direct Module Access
    // =========================================================================

    /**
     * Get the raw Emscripten module for advanced usage.
     *
     * @returns {Object} The raw WASM module
     */
    get module() {
        return this._module;
    }

    /**
     * Get the raw player pointer for advanced usage.
     *
     * @returns {number|null} Player pointer
     */
    get player() {
        return this._player;
    }

    /**
     * Get the sample rate.
     *
     * @returns {number} Sample rate in Hz
     */
    get sampleRate() {
        return this._sampleRate;
    }

    // =========================================================================
    // Private
    // =========================================================================

    /** @private */
    _ensurePlayer() {
        if (!this._player) {
            throw new Error('Synthesizer not initialized - call init() first');
        }
    }
}

export default AdlMidiCore;
