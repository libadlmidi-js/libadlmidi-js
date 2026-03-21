/**
 * libADLMIDI-JS - Main Thread Interface
 *
 * High-level API for real-time OPL3 FM synthesis in the browser.
 *
 * @example
 * ```javascript
 * import { AdlMidi } from 'libadlmidi-js';
 *
 * const synth = new AdlMidi();
 * await synth.init('/path/to/processor.js');
 *
 * synth.noteOn(0, 60, 100);  // Middle C on channel 0
 * synth.noteOff(0, 60);
 * ```
 */

import { Emulator, TrackOption } from './utils/constants.js';
export { Emulator, TrackOption };

/**
 * Bank identifier for instrument access
 * @typedef {Object} BankId
 * @property {boolean} percussive - True for percussion bank, false for melodic
 * @property {number} msb - Bank MSB (0-127)
 * @property {number} lsb - Bank LSB (0-127)
 */

/**
 * OPL3 operator parameters  
 * @typedef {Object} Operator
 * @property {boolean} am - Amplitude modulation (tremolo)
 * @property {boolean} vibrato - Vibrato (frequency modulation)
 * @property {boolean} sustaining - Sustaining (EG type)
 * @property {boolean} ksr - Key scale rate
 * @property {number} freqMult - Frequency multiplier (0-15)
 * @property {number} keyScaleLevel - Key scale level (0-3)
 * @property {number} totalLevel - Total level / attenuation (0-63, 0 = loudest)
 * @property {number} attack - Attack rate (0-15)
 * @property {number} decay - Decay rate (0-15)
 * @property {number} sustain - Sustain level (0-15, 0 = loudest)
 * @property {number} release - Release rate (0-15)
 * @property {number} waveform - Waveform select (0-7)
 */

/**
 * Complete OPL3 instrument definition
 * @typedef {Object} Instrument
 * @property {boolean} is4op - 4-operator mode enabled
 * @property {boolean} isPseudo4op - Pseudo 4-op (two 2-op voices)
 * @property {boolean} isBlank - Blank/unused instrument
 * @property {boolean} isRhythmModeCar - Rhythm mode carrier flag
 * @property {boolean} isRhythmModeMod - Rhythm mode modulator flag
 * @property {number} feedback1 - Voice 1 feedback (0-7)
 * @property {number} connection1 - Voice 1 connection (0 = FM, 1 = additive)
 * @property {number} feedback2 - Voice 2 feedback (0-7, 4-op only)
 * @property {number} connection2 - Voice 2 connection (0 = FM, 1 = additive, 4-op only)
 * @property {number} noteOffset1 - Note offset for voice 1 (semitones)
 * @property {number} noteOffset2 - Note offset for voice 2 (semitones)
 * @property {number} velocityOffset - Velocity offset
 * @property {number} secondVoiceDetune - Second voice detune (cents)
 * @property {number} percussionNote - Percussion note number
 * @property {number} delayOnMs - Delay before note-on (ms)
 * @property {number} delayOffMs - Delay before note-off (ms)
 * @property {[Operator, Operator, Operator, Operator]} operators - Four operators
 */

/**
 * Configuration settings for the synthesizer
 * @typedef {Object} ConfigureSettings
 * @property {number} [numChips] - Number of emulated OPL3 chips (1-100)
 * @property {number} [numFourOpChannels] - Number of 4-op channels (-1 = auto)
 * @property {number} [bank] - Embedded bank number
 * @property {boolean} [softPan] - Enable soft stereo panning
 * @property {boolean} [deepVibrato] - Enable deep vibrato
 * @property {boolean} [deepTremolo] - Enable deep tremolo
 */

export class AdlMidi {
    /** @type {boolean} */
    #ready = false;
    /** @type {Map<string, Set<Function>>} */
    #messageHandlers = new Map();
    /** @type {number} */
    #nextRequestId = 0;

    /**
     * Create a new AdlMidi instance
     * @param {AudioContext} [context] - Optional AudioContext to use. Creates one if not provided.
     */
    constructor(context) {
        this.ctx = context || null;
        this.node = null;
    }

    /**
     * Get the AudioContext (may be null before init)
     * @returns {AudioContext | null}
     */
    get audioContext() {
        return this.ctx;
    }

    /**
     * Check if the synth is ready
     * @returns {boolean}
     */
    get ready() {
        return this.#ready;
    }

    /**
     * Initialize the synthesizer
     * @param {string} processorUrl - URL to the bundled processor JavaScript file
     * @param {string | null} [wasmUrl=null] - Optional URL to the .wasm file for split builds.
     *                             If not provided, assumes bundled version with embedded WASM.
     * @returns {Promise<void>}
     */
    async init(processorUrl, wasmUrl = null) {
        if (!this.ctx) {
            this.ctx = new AudioContext({ sampleRate: 44100 });
        }

        // Resume AudioContext if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // For split builds, fetch the WASM binary from main thread
        // (AudioWorklet doesn't have fetch access)
        // If wasmUrl not provided, derive it from processorUrl
        const effectiveWasmUrl = wasmUrl || processorUrl.replace('.processor.js', '.core.wasm');
        const response = await fetch(effectiveWasmUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status}`);
        }
        const wasmBinary = await response.arrayBuffer();

        // Add the AudioWorklet module
        await this.ctx.audioWorklet.addModule(processorUrl);

        // Create the AudioWorkletNode
        this.node = new AudioWorkletNode(this.ctx, 'adl-midi-processor', {
            processorOptions: {
                sampleRate: this.ctx.sampleRate,
                wasmBinary: wasmBinary  // null for bundled, ArrayBuffer for split
            }
        });

        // Connect to destination
        this.node.connect(this.ctx.destination);

        // Set up message handling
        this.node.port.onmessage = (e) => this.#handleMessage(e.data);

        // Wait for the processor to be ready
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for WASM initialization'));
            }, 10000);

            this.#onceMessage('ready', () => {
                clearTimeout(timeout);
                this.#ready = true;
                resolve();
            });

            this.#onceMessage('error', /** @param {{message: string}} msg */(msg) => {
                clearTimeout(timeout);
                reject(new Error(msg.message));
            });
        });
    }

    /**
     * Internal message handler
     * @param {{type: string}} msg - Message from processor
     */
    #handleMessage(msg) {
        const handlers = this.#messageHandlers.get(msg.type);
        if (handlers) {
            handlers.forEach(/** @param {Function} handler */ handler => handler(msg));
        }
    }

    /**
     * Register a one-time message handler
     * @param {string} type - Message type
     * @param {Function} handler - Handler function
     */
    #onceMessage(type, handler) {
        if (!this.#messageHandlers.has(type)) {
            this.#messageHandlers.set(type, new Set());
        }

        /** @param {Object} msg */
        const wrappedHandler = (msg) => {
            this.#messageHandlers.get(type)?.delete(wrappedHandler);
            handler(msg);
        };

        this.#messageHandlers.get(type)?.add(wrappedHandler);
    }

    /**
     * Register a one-time handler correlated by request ID.
     * Allows concurrent operations of the same type without reply misrouting.
     * @param {string} type - Message type
     * @param {number} reqId - Request ID to match against
     * @param {Function} handler - Handler function
     */
    #onceCorrelatedMessage(type, reqId, handler) {
        if (!this.#messageHandlers.has(type)) {
            this.#messageHandlers.set(type, new Set());
        }

        /** @param {{reqId?: number}} msg */
        const filteredHandler = (msg) => {
            if (msg.reqId === reqId) {
                this.#messageHandlers.get(type)?.delete(filteredHandler);
                handler(msg);
            }
        };

        this.#messageHandlers.get(type)?.add(filteredHandler);
    }

    /**
     * Send a message to the processor
     * @param {Object} msg - Message to send
     */
    #send(msg) {
        if (this.node) {
            this.node.port.postMessage(msg);
        }
    }

    /**
     * Play a note
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - MIDI note number (0-127)
     * @param {number} velocity - Note velocity (0-127)
     */
    noteOn(channel, note, velocity) {
        this.#send({ type: 'noteOn', channel, note, velocity });
    }

    /**
     * Stop a note
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - MIDI note number (0-127)
     */
    noteOff(channel, note) {
        this.#send({ type: 'noteOff', channel, note });
    }

    /**
     * Set pitch bend
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} value - Pitch bend value (0-16383, 8192 = center)
     */
    pitchBend(channel, value) {
        const lsb = value & 0x7F;
        const msb = (value >> 7) & 0x7F;
        this.#send({ type: 'pitchBend', channel, lsb, msb });
    }

    /**
     * Send a control change
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} controller - Controller number (0-127)
     * @param {number} value - Controller value (0-127)
     */
    controlChange(channel, controller, value) {
        this.#send({ type: 'controlChange', channel, controller, value });
    }

    /**
     * Change program (instrument)
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} program - Program number (0-127)
     */
    programChange(channel, program) {
        this.#send({ type: 'programChange', channel, program });
    }

    /**
     * Send note aftertouch
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} note - Note number (0-127)
     * @param {number} pressure - Pressure (0-127)
     */
    noteAfterTouch(channel, note, pressure) {
        this.#send({ type: 'noteAfterTouch', channel, note, pressure });
    }

    /**
     * Send channel aftertouch
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} pressure - Pressure (0-127)
     */
    channelAfterTouch(channel, pressure) {
        this.#send({ type: 'channelAfterTouch', channel, pressure });
    }

    /**
     * Change bank (16-bit)
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} bank - Bank number
     */
    bankChange(channel, bank) {
        this.#send({ type: 'bankChange', channel, bank });
    }

    /**
     * Change bank MSB
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} msb - Bank MSB (0-127)
     */
    bankChangeMSB(channel, msb) {
        this.#send({ type: 'bankChangeMSB', channel, msb });
    }

    /**
     * Change bank LSB
     * @param {number} channel - MIDI channel (0-15)
     * @param {number} lsb - Bank LSB (0-127)
     */
    bankChangeLSB(channel, lsb) {
        this.#send({ type: 'bankChangeLSB', channel, lsb });
    }

    /**
     * Reset the real-time state (stops all notes, resets controllers)
     * @returns {void}
     */
    resetState() {
        this.#send({ type: 'resetState' });
    }

    /**
     * Panic - stop all sounds immediately
     * @returns {void}
     */
    panic() {
        this.#send({ type: 'panic' });
    }

    /**
     * Configure synth settings at runtime
     * @param {ConfigureSettings} settings - Settings object
     * @returns {Promise<void>}
     */
    async configure(settings) {
        return new Promise((resolve) => {
            this.#onceMessage('configured', () => resolve());
            this.#send({ type: 'configure', settings });
        });
    }

    /**
     * Load a custom bank file (WOPL format)
     * @param {ArrayBuffer} arrayBuffer - Bank file data
     * @returns {Promise<void>}
     */
    async loadBankData(arrayBuffer) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('bankLoaded', /** @param {{success: boolean, error?: string}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(msg.error || 'Failed to load bank'));
                }
            });

            this.#send({ type: 'loadBankData', data: arrayBuffer });
        });
    }

    /**
     * Set the embedded bank by number
     * @param {number} bank - Bank number
     * @returns {Promise<void>}
     */
    async setBank(bank) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('bankSet', /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(`Failed to set bank ${bank}`));
                }
            });

            this.#send({ type: 'setBank', bank });
        });
    }

    /**
     * Get an instrument from a bank for editing
     * @param {BankId} [bankId] - Bank identifier
     * @param {number} [programNumber] - Program/instrument number (0-127)
     * @returns {Promise<Instrument>} Instrument object with named properties
     */
    async getInstrument(bankId = { percussive: false, msb: 0, lsb: 0 }, programNumber = 0) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('instrumentLoaded', /** @param {{success: boolean, instrument: Instrument, error?: string}} msg */(msg) => {
                if (msg.success) {
                    resolve(msg.instrument);
                } else {
                    reject(new Error(msg.error || 'Failed to get instrument'));
                }
            });

            this.#send({ type: 'getInstrument', bankId, programNumber });
        });
    }

    /**
     * Set an instrument in a bank
     * @param {BankId} bankId - Bank identifier
     * @param {number} programNumber - Program/instrument number (0-127)
     * @param {Instrument} instrument - Instrument object with operator parameters
     * @returns {Promise<void>}
     */
    async setInstrument(bankId = { percussive: false, msb: 0, lsb: 0 }, programNumber, instrument) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('instrumentSet', /** @param {{success: boolean, error?: string}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(msg.error || 'Failed to set instrument'));
                }
            });

            this.#send({ type: 'setInstrument', bankId, programNumber, instrument });
        });
    }

    /**
     * Set the number of emulated OPL3 chips
     * @param {number} chips - Number of chips (1-100)
     */
    setNumChips(chips) {
        this.#send({ type: 'setNumChips', chips });
    }

    /**
     * Set the number of 4-operator channels
     * @param {number} channels - Number of channels (-1 for auto)
     */
    setNumFourOpChannels(channels) {
        this.#send({ type: 'setNumFourOpChannels', channels });
    }

    /**
     * Get the number of 4-operator channels
     * @returns {Promise<number>}
     */
    async getNumFourOpChannels() {
        return new Promise((resolve) => {
            this.#onceMessage('numFourOpChannels', /** @param {{channels: number}} msg */(msg) => {
                resolve(msg.channels);
            });
            this.#send({ type: 'getNumFourOpChannels' });
        });
    }

    /**
     * Get the number of 4-operator channels obtained
     * @returns {Promise<number>}
     */
    async getNumFourOpChannelsObtained() {
        return new Promise((resolve) => {
            this.#onceMessage('numFourOpChannelsObtained', /** @param {{channels: number}} msg */(msg) => {
                resolve(msg.channels);
            });
            this.#send({ type: 'getNumFourOpChannelsObtained' });
        });
    }

    /**
     * Enable/disable scaling of modulators by volume
     * @param {boolean} enabled
     */
    setScaleModulators(enabled) {
        this.#send({ type: 'setScaleModulators', enabled });
    }

    /**
     * Enable/disable full-range brightness
     * @param {boolean} enabled
     */
    setFullRangeBrightness(enabled) {
        this.#send({ type: 'setFullRangeBrightness', enabled });
    }

    /**
     * Enable/disable automatic arpeggio
     * @param {boolean} enabled
     */
    setAutoArpeggio(enabled) {
        this.#send({ type: 'setAutoArpeggio', enabled });
    }

    /**
     * Get automatic arpeggio state
     * @returns {Promise<boolean>}
     */
    async getAutoArpeggio() {
        return new Promise((resolve) => {
            this.#onceMessage('autoArpeggio', /** @param {{enabled: boolean}} msg */(msg) => {
                resolve(msg.enabled);
            });
            this.#send({ type: 'getAutoArpeggio' });
        });
    }

    /**
     * Set channel allocation mode
     * @param {number} mode - Mode ID
     */
    setChannelAllocMode(mode) {
        this.#send({ type: 'setChannelAllocMode', mode });
    }

    /**
     * Get channel allocation mode
     * @returns {Promise<number>}
     */
    async getChannelAllocMode() {
        return new Promise((resolve) => {
            this.#onceMessage('channelAllocMode', /** @param {{mode: number}} msg */(msg) => {
                resolve(msg.mode);
            });
            this.#send({ type: 'getChannelAllocMode' });
        });
    }

    /**
     * Set the volume range model
     * @param {number} model - Volume model number
     */
    setVolumeRangeModel(model) {
        this.#send({ type: 'setVolumeRangeModel', model });
    }

    /**
     * Enable/disable soft stereo panning
     * @param {boolean} enabled
     */
    setSoftPanEnabled(enabled) {
        this.#send({ type: 'setSoftPanEnabled', enabled });
    }

    /**
     * Enable/disable deep vibrato
     * @param {boolean} enabled
     */
    setDeepVibrato(enabled) {
        this.#send({ type: 'setDeepVibrato', enabled });
    }

    /**
     * Get deep vibrato state
     * @returns {Promise<boolean>}
     */
    async getDeepVibrato() {
        return new Promise((resolve) => {
            this.#onceMessage('deepVibrato', /** @param {{enabled: boolean}} msg */(msg) => {
                resolve(msg.enabled);
            });
            this.#send({ type: 'getDeepVibrato' });
        });
    }

    /**
     * Enable/disable deep tremolo
     * @param {boolean} enabled
     */
    setDeepTremolo(enabled) {
        this.#send({ type: 'setDeepTremolo', enabled });
    }

    /**
     * Get deep tremolo state
     * @returns {Promise<boolean>}
     */
    async getDeepTremolo() {
        return new Promise((resolve) => {
            this.#onceMessage('deepTremolo', /** @param {{enabled: boolean}} msg */(msg) => {
                resolve(msg.enabled);
            });
            this.#send({ type: 'getDeepTremolo' });
        });
    }

    /**
     * Run emulator with PCM rate to reduce CPU usage
     * @param {boolean} enabled
     */
    setRunAtPcmRate(enabled) {
        this.#send({ type: 'setRunAtPcmRate', enabled });
    }

    /**
     * Switch the OPL3 emulator core at runtime
     * 
     * Only emulators compiled into the current build profile are available:
     * - nuked profile: NUKED only
     * - dosbox profile: DOSBOX only  
     * - light profile: NUKED, DOSBOX
     * - full profile: NUKED, DOSBOX, OPAL, JAVA, ESFMu, YMFM_OPL2, YMFM_OPL3
     * 
     * @param {number} emulator - Emulator ID from the Emulator enum
     * @returns {Promise<void>} Resolves when emulator is switched, rejects if unavailable
     * @example
     * import { AdlMidi, Emulator } from 'libadlmidi-js';
     * await synth.switchEmulator(Emulator.DOSBOX);
     */
    async switchEmulator(emulator) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('emulatorSwitched', /** @param {{success: boolean, emulator: number}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(`Failed to switch to emulator ${emulator}. It may not be available in this build profile.`));
                }
            });
            this.#send({ type: 'switchEmulator', emulator });
        });
    }

    /**
     * Get the name of the currently active OPL3 emulator
     * @returns {Promise<string>} Human-readable emulator name (e.g., "Nuked OPL3 (v 1.8)")
     * @example
     * const name = await synth.getEmulatorName();
     * console.log(`Using: ${name}`);
     */
    async getEmulatorName() {
        return new Promise((resolve) => {
            this.#onceMessage('emulatorName', /** @param {{name: string}} msg */(msg) => {
                resolve(msg.name);
            });
            this.#send({ type: 'getEmulatorName' });
        });
    }

    /**
     * Get the last error info for the player instance
     * @returns {Promise<string>}
     */
    async getErrorInfo() {
        return new Promise((resolve) => {
            this.#onceMessage('errorInfo', /** @param {{info: string}} msg */(msg) => {
                resolve(msg.info);
            });
            this.#send({ type: 'getErrorInfo' });
        });
    }

    /**
     * Get the version string of the linked libADLMIDI library
     * @returns {Promise<string>}
     */
    async getLibraryVersion() {
        return new Promise((resolve) => {
            this.#onceMessage('libraryVersion', /** @param {{version: string}} msg */(msg) => {
                resolve(msg.version);
            });
            this.#send({ type: 'getLibraryVersion' });
        });
    }

    /**
     * Get the version of the linked libADLMIDI library as an object
     * @returns {Promise<{major: number, minor: number, patch: number}>}
     */
    async getVersion() {
        return new Promise((resolve) => {
            this.#onceMessage('version', /** @param {{version: {major: number, minor: number, patch: number}}} msg */(msg) => {
                resolve(msg.version);
            });
            this.#send({ type: 'getVersion' });
        });
    }

    /**
     * Get the number of emulated chips
     * @returns {Promise<number>}
     */
    async getNumChips() {
        return new Promise((resolve) => {
            this.#onceMessage('numChips', /** @param {{chips: number}} msg */(msg) => {
                resolve(msg.chips);
            });
            this.#send({ type: 'getNumChips' });
        });
    }

    /**
     * Get the number of emulated chips obtained
     * @returns {Promise<number>}
     */
    async getNumChipsObtained() {
        return new Promise((resolve) => {
            this.#onceMessage('numChipsObtained', /** @param {{chips: number}} msg */(msg) => {
                resolve(msg.chips);
            });
            this.#send({ type: 'getNumChipsObtained' });
        });
    }

    /**
     * Get the volume range model
     * @returns {Promise<number>}
     */
    async getVolumeRangeModel() {
        return new Promise((resolve) => {
            this.#onceMessage('volumeRangeModel', /** @param {{model: number}} msg */(msg) => {
                resolve(msg.model);
            });
            this.#send({ type: 'getVolumeRangeModel' });
        });
    }

    /**
     * Get list of embedded banks available in this build
     * Note: Slim builds have no embedded banks and will return an empty array
     * @returns {Promise<{id: number, name: string}[]>} Array of bank info objects
     * @example
     * const banks = await synth.getEmbeddedBanks();
     * banks.forEach(b => console.log(`${b.id}: ${b.name}`));
     */
    async getEmbeddedBanks() {
        return new Promise((resolve) => {
            this.#onceMessage('embeddedBanks', /** @param {{banks: {id: number, name: string}[]}} msg */(msg) => {
                resolve(msg.banks);
            });
            this.#send({ type: 'getEmbeddedBanks' });
        });
    }

    // ================== Bank Management API ==================

    /**
     * Reserve a number of banks
     * @param {number} count - Number of banks to reserve
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async reserveBanks(count) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('banksReserved', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error('Failed to reserve banks'));
                }
            });
            this.#send({ type: 'reserveBanks', count, reqId });
        });
    }

    /**
     * Get the bank ID for a given bank identifier
     * @param {BankId} bankId - Bank identifier
     * @returns {Promise<{percussive: number, msb: number, lsb: number}|null>} Bank ID or null if not found
     */
    async getBankId(bankId) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve) => {
            this.#onceCorrelatedMessage('bankId', reqId, /** @param {{id: {percussive: number, msb: number, lsb: number}|null}} msg */(msg) => {
                resolve(msg.id);
            });
            this.#send({ type: 'getBankId', bankId, reqId });
        });
    }

    /**
     * Remove a bank by its identifier
     * @param {BankId} bankId - Bank identifier
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async removeBank(bankId) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('bankRemoved', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error('Failed to remove bank'));
                }
            });
            this.#send({ type: 'removeBank', bankId, reqId });
        });
    }

    /**
     * Load an embedded bank into a custom bank slot
     * @param {BankId} bankId - Target bank identifier
     * @param {number} num - Embedded bank number to load
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async loadEmbeddedBank(bankId, num) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('embeddedBankLoaded', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error('Failed to load embedded bank'));
                }
            });
            this.#send({ type: 'loadEmbeddedBank', bankId, num, reqId });
        });
    }

    // ================== SysEx API ==================

    /**
     * Send a System Exclusive (SysEx) message
     * @param {Uint8Array|ArrayBuffer} data - SysEx message data
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async systemExclusive(data) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('systemExclusiveSent', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error('Failed to send system exclusive message'));
                }
            });
            this.#send({ type: 'systemExclusive', data: Array.from(bytes), reqId });
        });
    }

    // ================== Debug / Diagnostics API ==================

    /**
     * Describe the current state of all channels (debug utility)
     * @returns {Promise<{text: string, attr: Uint8Array}>} Channel state text and raw per-channel attribute bytes
     */
    async describeChannels() {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve) => {
            this.#onceCorrelatedMessage('channelsDescribed', reqId, /** @param {{text: string, attr: number[]}} msg */(msg) => {
                resolve({ text: msg.text, attr: new Uint8Array(msg.attr) });
            });
            this.#send({ type: 'describeChannels', reqId });
        });
    }

    /**
     * Reset the synthesizer
     * @returns {void}
     */
    reset() {
        this.#send({ type: 'reset' });
    }

    // ================== MIDI File Playback API ==================

    /**
     * Load a MIDI file for playback
     * @param {ArrayBuffer} arrayBuffer - MIDI file data
     * @returns {Promise<{duration: number}>} Resolves with file info when loaded
     */
    async loadMidi(arrayBuffer) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('midiLoaded', /** @param {{success: boolean, duration: number, error?: string}} msg */(msg) => {
                if (msg.success) {
                    resolve({ duration: msg.duration });
                } else {
                    reject(new Error(msg.error || 'Failed to parse MIDI data'));
                }
            });

            this.#send({ type: 'loadMidi', data: arrayBuffer });
        });
    }

    /**
     * Get the music title of the loaded MIDI file
     * @returns {Promise<string>}
     */
    async getMusicTitle() {
        return new Promise((resolve) => {
            this.#onceMessage('musicTitle', /** @param {{title: string}} msg */(msg) => {
                resolve(msg.title);
            });
            this.#send({ type: 'getMusicTitle' });
        });
    }

    /**
     * Get the copyright notice of the loaded MIDI file
     * @returns {Promise<string>}
     */
    async getMusicCopyright() {
        return new Promise((resolve) => {
            this.#onceMessage('musicCopyright', /** @param {{copyright: string}} msg */(msg) => {
                resolve(msg.copyright);
            });
            this.#send({ type: 'getMusicCopyright' });
        });
    }

    /**
     * Get the number of track titles in the loaded MIDI file
     * @returns {Promise<number>}
     */
    async getTrackTitleCount() {
        return new Promise((resolve) => {
            this.#onceMessage('trackTitleCount', /** @param {{count: number}} msg */(msg) => {
                resolve(msg.count);
            });
            this.#send({ type: 'getTrackTitleCount' });
        });
    }

    /**
     * Get a track title by index
     * @param {number} index - Track title index
     * @returns {Promise<string>}
     */
    async getTrackTitle(index) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve) => {
            this.#onceCorrelatedMessage('trackTitle', reqId, /** @param {{title: string}} msg */(msg) => {
                resolve(msg.title);
            });
            this.#send({ type: 'getTrackTitle', index, reqId });
        });
    }

    /**
     * Get the number of MIDI markers in the loaded file
     * @returns {Promise<number>}
     */
    async getMarkerCount() {
        return new Promise((resolve) => {
            this.#onceMessage('markerCount', /** @param {{count: number}} msg */(msg) => {
                resolve(msg.count);
            });
            this.#send({ type: 'getMarkerCount' });
        });
    }

    /**
     * Start or resume MIDI file playback
     * @returns {void}
     */
    play() {
        this.#send({ type: 'play' });
    }

    /**
     * Stop MIDI file playback and rewind to beginning
     * @returns {void}
     */
    stop() {
        this.#send({ type: 'stop' });
    }

    /**
     * Seek to a position in the MIDI file
     * @param {number} seconds - Position in seconds
     * @returns {void}
     */
    seek(seconds) {
        this.#send({ type: 'seek', position: seconds });
    }

    /**
     * Enable or disable looping for MIDI file playback
     * @param {boolean} enabled - Whether to loop
     * @returns {void}
     */
    setLoopEnabled(enabled) {
        this.#send({ type: 'setLoopEnabled', enabled });
    }

    /**
     * Set the number of loop repetitions
     * @param {number} count - Loop count (-1 = infinite, 0 = no loops, 1+ = number of loops)
     */
    setLoopCount(count) {
        this.#send({ type: 'setLoopCount', count });
    }

    /**
     * Enable/disable loop hooks only mode
     * @param {boolean} enabled
     */
    setLoopHooksOnly(enabled) {
        this.#send({ type: 'setLoopHooksOnly', enabled });
    }

    /**
     * Get the loop start time in seconds
     * @returns {Promise<number>}
     */
    async getLoopStartTime() {
        return new Promise((resolve) => {
            this.#onceMessage('loopStartTime', /** @param {{time: number}} msg */(msg) => {
                resolve(msg.time);
            });
            this.#send({ type: 'getLoopStartTime' });
        });
    }

    /**
     * Get the loop end time in seconds
     * @returns {Promise<number>}
     */
    async getLoopEndTime() {
        return new Promise((resolve) => {
            this.#onceMessage('loopEndTime', /** @param {{time: number}} msg */(msg) => {
                resolve(msg.time);
            });
            this.#send({ type: 'getLoopEndTime' });
        });
    }

    /**
     * Select a song number for multi-song MIDI files
     * @param {number} num - Song number (0-based)
     */
    selectSongNum(num) {
        this.#send({ type: 'selectSongNum', num });
    }

    /**
     * Get the number of songs in the loaded MIDI file
     * @returns {Promise<number>}
     */
    async getSongsCount() {
        return new Promise((resolve) => {
            this.#onceMessage('songsCount', /** @param {{count: number}} msg */(msg) => {
                resolve(msg.count);
            });
            this.#send({ type: 'getSongsCount' });
        });
    }

    /**
     * Get the number of tracks in the loaded MIDI file
     * @returns {Promise<number>}
     */
    async getTrackCount() {
        return new Promise((resolve) => {
            this.#onceMessage('trackCount', /** @param {{count: number}} msg */(msg) => {
                resolve(msg.count);
            });
            this.#send({ type: 'getTrackCount' });
        });
    }

    /**
     * Set track options (enable, mute, or solo)
     * Use the TrackOption enum: TrackOption.ON (1), TrackOption.OFF (2), TrackOption.SOLO (3).
     * Note: Passing 0 is a silent no-op that resolves without changing state.
     * @param {number} track - Track index
     * @param {number} options - Track option from TrackOption enum
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async setTrackOptions(track, options) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('trackOptionsSet', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(`Failed to set track options for track ${track}`));
                }
            });
            this.#send({ type: 'setTrackOptions', track, options, reqId });
        });
    }

    /**
     * Enable or disable a MIDI channel
     * @param {number} channel - MIDI channel (0-15)
     * @param {boolean} enabled - Whether to enable the channel
     * @returns {Promise<void>} Resolves on success, rejects on failure
     */
    async setChannelEnabled(channel, enabled) {
        const reqId = this.#nextRequestId++;
        return new Promise((resolve, reject) => {
            this.#onceCorrelatedMessage('channelEnabledSet', reqId, /** @param {{success: boolean}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(`Failed to set channel ${channel} enabled state`));
                }
            });
            this.#send({ type: 'setChannelEnabled', channel, enabled, reqId });
        });
    }

    /**
     * Set the playback tempo multiplier
     * @param {number} tempo - Tempo multiplier (1.0 = normal speed)
     * @returns {void}
     */
    setTempo(tempo) {
        this.#send({ type: 'setTempo', tempo });
    }

    /**
     * Get the current playback state
     * @returns {Promise<{position: number, duration: number, atEnd: boolean, playMode: string}>}
     */
    async getPlaybackState() {
        return new Promise((resolve) => {
            this.#onceMessage('state', /** @param {{position: number, duration: number, atEnd: boolean, playMode: string}} msg */(msg) => {
                resolve({
                    position: msg.position,
                    duration: msg.duration,
                    atEnd: msg.atEnd,
                    playMode: msg.playMode
                });
            });

            this.#send({ type: 'getState' });
        });
    }

    /**
     * Register a handler for playback state updates
     * Useful for progress tracking during playback
     * @param {function({position: number, duration: number, atEnd: boolean, playMode: string}): void} handler
     * @returns {function(): void} Unsubscribe function
     */
    onPlaybackState(handler) {
        if (!this.#messageHandlers.has('state')) {
            this.#messageHandlers.set('state', new Set());
        }
        this.#messageHandlers.get('state')?.add(handler);

        // Return unsubscribe function
        return () => {
            this.#messageHandlers.get('state')?.delete(handler);
        };
    }

    /**
     * Register a handler for when playback ends naturally
     * @param {function(): void} handler
     * @returns {function(): void} Unsubscribe function
     */
    onPlaybackEnded(handler) {
        if (!this.#messageHandlers.has('playbackEnded')) {
            this.#messageHandlers.set('playbackEnded', new Set());
        }
        this.#messageHandlers.get('playbackEnded')?.add(handler);

        // Return unsubscribe function
        return () => {
            this.#messageHandlers.get('playbackEnded')?.delete(handler);
        };
    }

    /**
     * Close the synthesizer and release resources
     * @returns {void}
     */
    close() {
        if (this.node) {
            this.node.disconnect();
            this.node = null;
        }
        this.#ready = false;
    }

    /**
     * Suspend the AudioContext (save CPU when not in use)
     * @returns {Promise<void>}
     */
    async suspend() {
        if (this.ctx) {
            await this.ctx.suspend();
        }
    }

    /**
     * Resume the AudioContext
     * @returns {Promise<void>}
     */
    async resume() {
        if (this.ctx) {
            await this.ctx.resume();
        }
    }
}

export default AdlMidi;
