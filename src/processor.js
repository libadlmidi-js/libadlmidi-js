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
            // For split builds, use pre-fetched WASM binary from main thread
            const moduleConfig = processorOptions?.wasmBinary
                ? { wasmBinary: processorOptions.wasmBinary }
                : undefined;
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
        const heap = this.adl.HEAPU8;
        const view = new DataView(heap.buffer, ptr, AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);

        let offset = 0;

        // int version (4 bytes)
        const version = view.getInt32(offset, true); offset += 4;

        // int16_t note_offset1, note_offset2 (2 bytes each)
        const noteOffset1 = view.getInt16(offset, true); offset += 2;
        const noteOffset2 = view.getInt16(offset, true); offset += 2;

        // int8_t midi_velocity_offset, second_voice_detune (1 byte each)
        const velocityOffset = view.getInt8(offset); offset += 1;
        const secondVoiceDetune = view.getInt8(offset); offset += 1;

        // uint8_t percussion_key_number, inst_flags, fb_conn1, fb_conn2
        const percussionKey = heap[ptr + offset]; offset += 1;
        const instFlags = heap[ptr + offset]; offset += 1;
        const fbConn1 = heap[ptr + offset]; offset += 1;
        const fbConn2 = heap[ptr + offset]; offset += 1;

        // ADL_Operator operators[4] - 5 bytes each, but may have padding
        // Offset should be at 14 now, operators start after potential padding
        offset = 14; // Adjusted for structure alignment

        const operators = [];
        for (let i = 0; i < 4; i++) {
            const opBytes = heap.slice(ptr + offset, ptr + offset + 5);
            operators.push(this.decodeOperator(opBytes));
            offset += 5;
        }

        // After 4 operators (20 bytes), we're at offset 34
        // uint16_t delay_on_ms, delay_off_ms
        offset = 34;
        const delayOnMs = view.getUint16(offset, true); offset += 2;
        const delayOffMs = view.getUint16(offset, true);

        return {
            version,
            noteOffset1,
            noteOffset2,
            velocityOffset,
            secondVoiceDetune,
            percussionKey,

            // Decode flags
            is4op: !!(instFlags & 0x01),
            isPseudo4op: !!(instFlags & 0x02),
            isBlank: !!(instFlags & 0x04),
            rhythmMode: (instFlags >> 3) & 0x07,

            // Decode feedback/connection
            feedback1: (fbConn1 >> 1) & 0x07,
            connection1: fbConn1 & 0x01,
            feedback2: (fbConn2 >> 1) & 0x07,
            connection2: fbConn2 & 0x01,

            operators,
            delayOnMs,
            delayOffMs
        };
    }

    /**
     * Write JS instrument object to WASM memory
     */
    writeInstrumentToMemory(ptr, inst) {
        const heap = this.adl.HEAPU8;
        const view = new DataView(heap.buffer, ptr, AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);

        let offset = 0;

        // int version
        view.setInt32(offset, inst.version || 0, true); offset += 4;

        // int16_t note_offset1, note_offset2
        view.setInt16(offset, inst.noteOffset1 || 0, true); offset += 2;
        view.setInt16(offset, inst.noteOffset2 || 0, true); offset += 2;

        // int8_t midi_velocity_offset, second_voice_detune
        view.setInt8(offset, inst.velocityOffset || 0); offset += 1;
        view.setInt8(offset, inst.secondVoiceDetune || 0); offset += 1;

        // uint8_t percussion_key_number
        heap[ptr + offset] = inst.percussionKey || 0; offset += 1;

        // uint8_t inst_flags
        let flags = 0;
        if (inst.is4op) flags |= 0x01;
        if (inst.isPseudo4op) flags |= 0x02;
        if (inst.isBlank) flags |= 0x04;
        flags |= ((inst.rhythmMode || 0) & 0x07) << 3;
        heap[ptr + offset] = flags; offset += 1;

        // uint8_t fb_conn1, fb_conn2
        heap[ptr + offset] = ((inst.feedback1 & 0x07) << 1) | (inst.connection1 & 0x01); offset += 1;
        heap[ptr + offset] = ((inst.feedback2 & 0x07) << 1) | (inst.connection2 & 0x01); offset += 1;

        // ADL_Operator operators[4]
        offset = 14;
        for (let i = 0; i < 4; i++) {
            const opBytes = this.encodeOperator(inst.operators[i] || this.defaultOperator());
            heap.set(opBytes, ptr + offset);
            offset += 5;
        }

        // uint16_t delay_on_ms, delay_off_ms
        offset = 34;
        view.setUint16(offset, inst.delayOnMs || 0, true); offset += 2;
        view.setUint16(offset, inst.delayOffMs || 0, true);
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
                this.adl._adl_rt_pitchBendML(this.midi, msg.channel, msg.lsb, msg.msb);
                break;

            case 'controlChange':
                this.adl._adl_rt_controllerChange(this.midi, msg.channel, msg.controller, msg.value);
                break;

            case 'programChange':
                this.adl._adl_rt_patchChange(this.midi, msg.channel, msg.program);
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

            // MIDI file playback
            case 'loadMidi':
                this.loadMidiData(msg.data);
                break;

            case 'play':
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
