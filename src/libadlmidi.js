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

/**
 * Available OPL3 emulator cores.
 * Use with switchEmulator() to change the synthesis engine at runtime.
 * Note: Only emulators compiled into the current profile are available.
 * @readonly
 * @enum {number}
 */
export const Emulator = Object.freeze({
    /** Nuked OPL3 v1.8 - Most accurate, higher CPU usage */
    NUKED: 0,
    /** Nuked OPL3 v1.7.4 - Slightly older version */
    NUKED_174: 1,
    /** DosBox OPL3 - Good accuracy, lower CPU usage */
    DOSBOX: 2,
    /** Opal - Reality Adlib Tracker emulator */
    OPAL: 3,
    /** Java OPL3 - Port of emu8950 */
    JAVA: 4,
    /** ESFMu - ESFM chip emulator */
    ESFMU: 5,
    /** MAME OPL2 */
    MAME_OPL2: 6,
    /** YMFM OPL2 */
    YMFM_OPL2: 7,
    /** YMFM OPL3 */
    YMFM_OPL3: 8,
    /** Nuked OPL2 LLE - Transistor-level emulation */
    NUKED_OPL2_LLE: 9,
    /** Nuked OPL3 LLE - Transistor-level emulation */
    NUKED_OPL3_LLE: 10,
});

export class AdlMidi {
    /** @type {boolean} */
    #ready = false;
    /** @type {Map<string, Set<Function>>} */
    #messageHandlers = new Map();

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
        let wasmBinary = null;
        const effectiveWasmUrl = wasmUrl || processorUrl.replace('.processor.js', '.core.wasm');
        const response = await fetch(effectiveWasmUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status}`);
        }
        wasmBinary = await response.arrayBuffer();

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
    async loadBank(arrayBuffer) {
        return new Promise((resolve, reject) => {
            this.#onceMessage('bankLoaded', /** @param {{success: boolean, error?: string}} msg */(msg) => {
                if (msg.success) {
                    resolve();
                } else {
                    reject(new Error(msg.error || 'Failed to load bank'));
                }
            });

            this.#send({ type: 'loadBank', data: arrayBuffer });
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
     * Set the volume model
     * @param {number} model - Volume model number
     */
    setVolumeModel(model) {
        this.#send({ type: 'setVolumeModel', model });
    }

    /**
     * Enable/disable rhythm mode (percussion)
     * @param {boolean} enabled
     */
    setPercussionMode(enabled) {
        this.#send({ type: 'setPercMode', enabled });
    }

    /**
     * Enable/disable deep vibrato
     * @param {boolean} enabled
     */
    setVibrato(enabled) {
        this.#send({ type: 'setVibrato', enabled });
    }

    /**
     * Enable/disable deep tremolo
     * @param {boolean} enabled
     */
    setTremolo(enabled) {
        this.#send({ type: 'setTremolo', enabled });
    }

    /**
     * Switch the OPL3 emulator core at runtime
     * 
     * Only emulators compiled into the current build profile are available:
     * - nuked profile: NUKED only
     * - dosbox profile: DOSBOX only  
     * - light profile: NUKED, DOSBOX
     * - full profile: NUKED, DOSBOX, OPAL, JAVA, ESFMU, YMFM_OPL2, YMFM_OPL3
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
     * Reset the synthesizer
     * @returns {void}
     */
    reset() {
        this.#send({ type: 'reset' });
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
