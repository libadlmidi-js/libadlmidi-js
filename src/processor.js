/**
 * AudioWorklet Processor for libADLMIDI
 * 
 * This processor runs the OPL3 emulator in the audio worklet thread,
 * generating audio samples in real-time from MIDI commands.
 */

// Import the WASM module factory
// This import path is aliased at bundle time to the correct profile
import createADLMIDI from 'libadlmidi-wasm';

import {
    SIZEOF_ADL_OPERATOR,
    SIZEOF_ADL_INSTRUMENT,
    SIZEOF_ADL_BANK,
    SIZEOF_ADL_BANK_ID,
    decodeOperator,
    encodeOperator,
    defaultOperator,
    decodeInstrument,
    encodeInstrument,
} from './utils/struct.js';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2; // Int16

class AdlMidiProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.adl = null;
        this.midi = null;
        this.bufferPtr = null;
        this.ready = false;
        this.playMode = 'realtime'; // 'realtime' or 'file'
        this.sampleRate = options.processorOptions?.sampleRate || SAMPLE_RATE;
        this.cachedHeapBuffer = null; // Track heap buffer for view caching

        // Synth settings with defaults (can be overridden via processorOptions or messages)
        this.settings = {
            numChips: 4,              // Number of emulated OPL3 chips
            numFourOpChannels: -1,    // 4-op channels (-1 = auto)
            bank: 72,                 // FM bank number
            softPan: true,            // Soft stereo panning
            deepVibrato: false,       // Deep vibrato
            deepTremolo: false,       // Deep tremolo
            ...options.processorOptions?.settings
        };

        // Pass processorOptions to initWasm for split build support
        this.initWasm(options.processorOptions);
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }

    async initWasm(processorOptions) {
        try {
            // For split builds, use instantiateWasm to bypass Emscripten's
            // file-locating code which uses URL (not available in AudioWorklet)
            let moduleConfig;
            if (processorOptions?.wasmBinary) {
                moduleConfig = {
                    instantiateWasm: (imports, successCallback) => {
                        WebAssembly.instantiate(processorOptions.wasmBinary, imports)
                            .then(result => successCallback(result.instance));
                        return {}; // indicates async instantiation
                    }
                };
            }
            const Module = await createADLMIDI(moduleConfig);
            this.adl = Module;

            // Initialize the MIDI player with desired sample rate
            this.midi = this.adl._adl_init(this.sampleRate);

            if (!this.midi) {
                throw new Error('Failed to initialize ADL MIDI player');
            }

            // Apply initial settings (can be overridden via messages)
            this.applySettings(this.settings);

            // Allocate buffer for audio generation
            // AudioWorklet uses 128 frames per block
            const FRAMES = 128;
            this.bufferSize = FRAMES * CHANNELS * BYTES_PER_SAMPLE;
            this.bufferPtr = this.adl._malloc(this.bufferSize);

            // Verify HEAP16 is available (required for audio output)
            if (!this.adl.HEAP16) {
                throw new Error('HEAP16 is not available after initialization');
            }

            this.ready = true;
            this.port.postMessage({ type: 'ready' });
        } catch (error) {
            console.error('Failed to initialize WASM:', error);
            this.port.postMessage({ type: 'error', message: error.message });
        }
    }
    /**
     * Apply synth settings
     */
    applySettings(settings) {
        if (!this.midi) return;

        if (settings.numChips !== undefined) {
            this.adl._adl_setNumChips(this.midi, settings.numChips);
        }
        if (settings.numFourOpChannels !== undefined) {
            this.adl._adl_setNumFourOpsChn(this.midi, settings.numFourOpChannels);
        }
        if (settings.bank !== undefined) {
            this.adl._adl_setBank(this.midi, settings.bank);
        }
        if (settings.softPan !== undefined) {
            this.adl._adl_setSoftPanEnabled(this.midi, settings.softPan ? 1 : 0);
        }
        if (settings.deepVibrato !== undefined) {
            this.adl._adl_setHVibrato(this.midi, settings.deepVibrato ? 1 : 0);
        }
        if (settings.deepTremolo !== undefined) {
            this.adl._adl_setHTremolo(this.midi, settings.deepTremolo ? 1 : 0);
        }
    }

    // ================== Instrument Editing API ==================

    // Structure sizes (imported from shared utils)
    static SIZEOF_ADL_OPERATOR = SIZEOF_ADL_OPERATOR;
    static SIZEOF_ADL_INSTRUMENT = SIZEOF_ADL_INSTRUMENT;
    static SIZEOF_ADL_BANK = SIZEOF_ADL_BANK;
    static SIZEOF_ADL_BANK_ID = SIZEOF_ADL_BANK_ID;

    /**
     * Decode an OPL3 operator from raw register bytes to named properties
     * @param {Uint8Array | number[]} bytes
     */
    decodeOperator(bytes) {
        return decodeOperator(bytes);
    }

    /**
     * Encode named operator properties to raw register bytes
     * @param {import('./utils/struct.js').Operator} op
     */
    encodeOperator(op) {
        return encodeOperator(op);
    }

    /**
     * Read ADL_Instrument from WASM memory and decode to JS object
     */
    readInstrumentFromMemory(ptr) {
        // Copy bytes from WASM heap and delegate to shared decoder
        const bytes = this.adl.HEAPU8.slice(ptr, ptr + SIZEOF_ADL_INSTRUMENT);
        return decodeInstrument(bytes);
    }

    /**
     * Write JS instrument object to WASM memory
     */
    writeInstrumentToMemory(ptr, inst) {
        // Encode to bytes and copy to WASM heap
        const bytes = encodeInstrument(inst);
        this.adl.HEAPU8.set(bytes, ptr);
    }

    /**
     * Default operator values (silent)
     */
    defaultOperator() {
        return defaultOperator();
    }

    /**
     * Get instrument from bank
     */
    getInstrument(bankId, programNumber) {
        try {
            // Allocate ADL_BankId struct (3 bytes)
            const bankIdPtr = this.adl._malloc(4); // 4 for alignment
            this.adl.HEAPU8[bankIdPtr] = bankId.percussive ? 1 : 0;
            this.adl.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
            this.adl.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;

            // Allocate ADL_Bank struct
            const bankPtr = this.adl._malloc(AdlMidiProcessor.SIZEOF_ADL_BANK);

            // Get bank (create if needed)
            const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 1, bankPtr);

            if (bankResult !== 0) {
                this.adl._free(bankIdPtr);
                this.adl._free(bankPtr);
                return { success: false, error: 'Failed to get bank' };
            }

            // Allocate ADL_Instrument struct
            const instPtr = this.adl._malloc(AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);

            // Get instrument
            const instResult = this.adl._adl_getInstrument(this.midi, bankPtr, programNumber, instPtr);

            let instrument = null;
            if (instResult === 0) {
                instrument = this.readInstrumentFromMemory(instPtr);
            }

            this.adl._free(bankIdPtr);
            this.adl._free(bankPtr);
            this.adl._free(instPtr);

            if (instrument) {
                return { success: true, instrument };
            } else {
                return { success: false, error: 'Failed to get instrument' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Set instrument in bank
     */
    setInstrument(bankId, programNumber, instrument) {
        try {
            // Allocate ADL_BankId struct
            const bankIdPtr = this.adl._malloc(4);
            this.adl.HEAPU8[bankIdPtr] = bankId.percussive ? 1 : 0;
            this.adl.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
            this.adl.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;

            // Allocate ADL_Bank struct
            const bankPtr = this.adl._malloc(AdlMidiProcessor.SIZEOF_ADL_BANK);

            // Get or create bank
            const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 1, bankPtr);

            if (bankResult !== 0) {
                this.adl._free(bankIdPtr);
                this.adl._free(bankPtr);
                return { success: false, error: 'Failed to get/create bank' };
            }

            // Allocate and write ADL_Instrument struct
            const instPtr = this.adl._malloc(AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);
            this.writeInstrumentToMemory(instPtr, instrument);

            // Set instrument
            const setResult = this.adl._adl_setInstrument(this.midi, bankPtr, programNumber, instPtr);

            // Per libADLMIDI docs: "Is recommended to call adl_reset() to apply changes to real-time"
            if (setResult === 0) {
                this.adl._adl_reset(this.midi);
            }

            this.adl._free(bankIdPtr);
            this.adl._free(bankPtr);
            this.adl._free(instPtr);

            if (setResult === 0) {
                return { success: true };
            } else {
                return { success: false, error: 'Failed to set instrument' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    handleMessage(msg) {
        if (!this.ready && msg.type !== 'ping') return;

        switch (msg.type) {
            case 'ping':
                this.port.postMessage({ type: 'pong', ready: this.ready });
                break;

            case 'noteOn':
                this.adl._adl_rt_noteOn(this.midi, msg.channel, msg.note, msg.velocity);
                break;

            case 'noteOff':
                this.adl._adl_rt_noteOff(this.midi, msg.channel, msg.note);
                break;

            case 'pitchBend':
                this.adl._adl_rt_pitchBendML(this.midi, msg.channel, msg.msb, msg.lsb);
                break;

            case 'controlChange':
                this.adl._adl_rt_controllerChange(this.midi, msg.channel, msg.controller, msg.value);
                break;

            case 'programChange':
                this.adl._adl_rt_patchChange(this.midi, msg.channel, msg.program);
                break;

            case 'noteAfterTouch':
                this.adl._adl_rt_noteAfterTouch(this.midi, msg.channel, msg.note, msg.pressure);
                break;

            case 'channelAfterTouch':
                this.adl._adl_rt_channelAfterTouch(this.midi, msg.channel, msg.pressure);
                break;

            case 'bankChange':
                this.adl._adl_rt_bankChange(this.midi, msg.channel, msg.bank);
                break;

            case 'bankChangeMSB':
                this.adl._adl_rt_bankChangeMSB(this.midi, msg.channel, msg.msb);
                break;

            case 'bankChangeLSB':
                this.adl._adl_rt_bankChangeLSB(this.midi, msg.channel, msg.lsb);
                break;

            case 'resetState':
                this.adl._adl_rt_resetState(this.midi);
                break;

            case 'panic':
                this.adl._adl_panic(this.midi);
                break;

            case 'configure':
                // Update settings at runtime
                Object.assign(this.settings, msg.settings);
                this.applySettings(msg.settings);
                this.port.postMessage({ type: 'configured' });
                break;

            case 'loadBank':
                this.loadBank(msg.data);
                break;

            case 'setBank': {
                const result = this.adl._adl_setBank(this.midi, msg.bank);
                this.port.postMessage({ type: 'bankSet', success: result === 0, bank: msg.bank });
                break;
            }

            case 'getInstrument': {
                const getResult = this.getInstrument(msg.bankId, msg.programNumber);
                this.port.postMessage({ type: 'instrumentLoaded', ...getResult });
                break;
            }

            case 'setInstrument': {
                const setResult = this.setInstrument(msg.bankId, msg.programNumber, msg.instrument);
                this.port.postMessage({ type: 'instrumentSet', ...setResult });
                break;
            }

            case 'setNumChips':
                this.adl._adl_setNumChips(this.midi, msg.chips);
                break;

            case 'setNumFourOpChannels':
                this.adl._adl_setNumFourOpsChn(this.midi, msg.channels);
                break;

            case 'getNumFourOpChannels':
                this.port.postMessage({ type: 'numFourOpChannels', channels: this.adl._adl_getNumFourOpsChn(this.midi) });
                break;

            case 'setScaleModulators':
                this.adl._adl_setScaleModulators(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setFullRangeBrightness':
                this.adl._adl_setFullRangeBrightness(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setAutoArpeggio':
                this.adl._adl_setAutoArpeggio(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'getAutoArpeggio':
                this.port.postMessage({ type: 'autoArpeggio', enabled: this.adl._adl_getAutoArpeggio(this.midi) !== 0 });
                break;

            case 'setChannelAllocMode':
                this.adl._adl_setChannelAllocMode(this.midi, msg.mode);
                break;

            case 'getChannelAllocMode':
                this.port.postMessage({ type: 'channelAllocMode', mode: this.adl._adl_getChannelAllocMode(this.midi) });
                break;

            case 'setVolumeModel':
                this.adl._adl_setVolumeRangeModel(this.midi, msg.model);
                break;

            case 'setPercMode':
                this.adl._adl_setPercMode(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setVibrato':
                this.adl._adl_setHVibrato(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setTremolo':
                this.adl._adl_setHTremolo(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setRunAtPcmRate':
                this.adl._adl_setRunAtPcmRate(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'switchEmulator': {
                // Note: adl_switchEmulator internally calls partialReset(), so no extra reset needed
                const result = this.adl._adl_switchEmulator(this.midi, msg.emulator);
                this.port.postMessage({ type: 'emulatorSwitched', success: result === 0, emulator: msg.emulator });
                break;
            }

            case 'getEmulatorName': {
                const namePtr = this.adl._adl_chipEmulatorName(this.midi);
                const name = namePtr ? this.adl.UTF8ToString(namePtr) : 'Unknown';
                this.port.postMessage({ type: 'emulatorName', name });
                break;
            }

            case 'getLibraryVersion': {
                const ptr = this.adl._adl_linkedLibraryVersion();
                const version = ptr ? this.adl.UTF8ToString(ptr) : 'Unknown';
                this.port.postMessage({ type: 'libraryVersion', version });
                break;
            }

            case 'getVersion': {
                const ptr = this.adl._adl_linkedVersion();
                const version = ptr ? {
                    major: this.adl.getValue(ptr, 'i16'),
                    minor: this.adl.getValue(ptr + 2, 'i16'),
                    patch: this.adl.getValue(ptr + 4, 'i16')
                } : null;
                this.port.postMessage({ type: 'version', version });
                break;
            }

            case 'getNumChips':
                this.port.postMessage({ type: 'numChips', chips: this.adl._adl_getNumChips(this.midi) });
                break;

            case 'getNumChipsObtained':
                this.port.postMessage({ type: 'numChipsObtained', chips: this.adl._adl_getNumChipsObtained(this.midi) });
                break;

            case 'getVolumeModel':
                this.port.postMessage({ type: 'volumeModel', model: this.adl._adl_getVolumeRangeModel(this.midi) });
                break;

            case 'getEmbeddedBanks': {
                const banks = this.getEmbeddedBankList();
                this.port.postMessage({ type: 'embeddedBanks', banks });
                break;
            }

            // MIDI file playback
            case 'loadMidi':
                this.loadMidiData(msg.data);
                break;

            case 'getMusicTitle': {
                const ptr = this.adl._adl_metaMusicTitle(this.midi);
                const title = ptr ? this.adl.UTF8ToString(ptr) : '';
                this.port.postMessage({ type: 'musicTitle', title });
                break;
            }

            case 'getMusicCopyright': {
                const ptr = this.adl._adl_metaMusicCopyright(this.midi);
                const copyright = ptr ? this.adl.UTF8ToString(ptr) : '';
                this.port.postMessage({ type: 'musicCopyright', copyright });
                break;
            }

            case 'play':
                // If at end, rewind first so play works as expected
                if (this.adl._adl_atEnd(this.midi) !== 0) {
                    this.adl._adl_positionRewind(this.midi);
                }
                this.playMode = 'file';
                break;

            case 'stop':
                this.playMode = 'realtime';
                this.adl._adl_positionRewind(this.midi);
                this.adl._adl_panic(this.midi);
                break;

            case 'seek':
                this.adl._adl_positionSeek(this.midi, msg.position);
                break;

            case 'setLoop':
                this.adl._adl_setLoopEnabled(this.midi, msg.enabled ? 1 : 0);
                break;

            case 'setTempo':
                this.adl._adl_setTempo(this.midi, msg.tempo);
                break;

            case 'getState':
                this.port.postMessage({
                    type: 'state',
                    position: this.adl._adl_positionTell(this.midi),
                    duration: this.adl._adl_totalTimeLength(this.midi),
                    atEnd: this.adl._adl_atEnd(this.midi) !== 0,
                    playMode: this.playMode
                });
                break;

            case 'reset':
                this.adl._adl_reset(this.midi);
                this.playMode = 'realtime';
                break;
        }
    }

    loadMidiData(arrayBuffer) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const dataPtr = this.adl._malloc(data.length);
            this.adl.HEAPU8.set(data, dataPtr);

            const result = this.adl._adl_openData(this.midi, dataPtr, data.length);
            this.adl._free(dataPtr);

            if (result === 0) {
                const duration = this.adl._adl_totalTimeLength(this.midi);
                this.port.postMessage({
                    type: 'midiLoaded',
                    success: true,
                    duration: duration
                });
            } else {
                this.port.postMessage({
                    type: 'midiLoaded',
                    success: false,
                    error: 'Failed to parse MIDI data'
                });
            }
        } catch (error) {
            this.port.postMessage({
                type: 'midiLoaded',
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get list of embedded banks with their names
     * @returns {{id: number, name: string}[]}
     */
    getEmbeddedBankList() {
        const count = this.adl._adl_getBanksCount();
        const namesPtr = this.adl._adl_getBankNames();
        const banks = [];

        // namesPtr points to an array of char* pointers
        for (let i = 0; i < count; i++) {
            // Read the pointer at offset i (4 bytes per pointer in WASM32)
            const strPtr = this.adl.getValue(namesPtr + i * 4, 'i32');
            const name = strPtr ? this.adl.UTF8ToString(strPtr) : `Bank ${i}`;
            banks.push({ id: i, name });
        }

        return banks;
    }

    loadBank(arrayBuffer) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const dataPtr = this.adl._malloc(data.length);
            this.adl.HEAPU8.set(data, dataPtr);

            const result = this.adl._adl_openBankData(this.midi, dataPtr, data.length);
            this.adl._free(dataPtr);

            if (result === 0) {
                this.port.postMessage({ type: 'bankLoaded', success: true });
            } else {
                this.port.postMessage({
                    type: 'bankLoaded',
                    success: false,
                    error: 'Failed to load bank data'
                });
            }
        } catch (error) {
            this.port.postMessage({
                type: 'bankLoaded',
                success: false,
                error: error.message
            });
        }
    }

    process(_inputs, outputs, _parameters) {
        if (!this.ready || !this.midi || !this.adl || !this.adl.HEAP16) return true;

        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const left = output[0];
        const right = output[1] || output[0]; // Mono fallback
        const frames = left.length;

        try {
            // Generate audio (16-bit stereo interleaved)
            const sampleCount = frames * 2;

            // Use adl_play for file playback mode, adl_generate for real-time
            if (this.playMode === 'file') {
                this.adl._adl_play(this.midi, sampleCount, this.bufferPtr);

                // When song ends, silence notes and switch to realtime mode
                if (this.adl._adl_atEnd(this.midi) !== 0) {
                    this.adl._adl_panic(this.midi);
                    this.playMode = 'realtime';
                    this.port.postMessage({ type: 'playbackEnded' });
                }
            } else {
                this.adl._adl_generate(this.midi, sampleCount, this.bufferPtr);
            }

            // Convert from Int16 to Float32
            // Cache the view - only recreate if WASM heap has grown
            const currentBuffer = this.adl.HEAP16.buffer;
            if (this.cachedHeapBuffer !== currentBuffer) {
                this.cachedHeapBuffer = currentBuffer;
            }
            const heap16 = new Int16Array(currentBuffer, this.bufferPtr, sampleCount);

            for (let i = 0; i < frames; i++) {
                left[i] = heap16[i * 2] / 32768.0;
                right[i] = heap16[i * 2 + 1] / 32768.0;
            }
        } catch (e) {
            // Report errors to main thread instead of silently swallowing
            this.port.postMessage({ type: 'processingError', error: e.message || String(e) });
        }

        return true;
    }
}

registerProcessor('adl-midi-processor', AdlMidiProcessor);
