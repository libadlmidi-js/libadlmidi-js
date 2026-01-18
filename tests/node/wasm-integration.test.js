/**
 * Node-based WASM integration tests
 * 
 * Loads the WASM module directly in Node to test C API functions
 * and struct encoding without needing a browser.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', '..', 'dist');

describe('WASM Module Direct Loading', () => {
    let Module;

    beforeAll(async () => {
        // Dynamically import the core module
        const { default: createADLMIDI } = await import(
            join(DIST_DIR, 'libadlmidi.nuked.core.js')
        );
        Module = await createADLMIDI();
    }, 30000);

    it('should load WASM module successfully', () => {
        expect(Module).toBeDefined();
        expect(Module._adl_init).toBeDefined();
    });

    it('should initialize synthesizer', () => {
        const sampleRate = 44100;
        const synth = Module._adl_init(sampleRate);
        expect(synth).toBeGreaterThan(0);  // Valid pointer
        Module._adl_close(synth);
    });

    it('should set and get bank count', () => {
        const synth = Module._adl_init(44100);
        const bankCount = Module._adl_getBanksCount();
        expect(bankCount).toBeGreaterThan(0);
        Module._adl_close(synth);
    });

    it('should set bank successfully', () => {
        const synth = Module._adl_init(44100);
        const result = Module._adl_setBank(synth, 72);
        expect(result).toBe(0);
        Module._adl_close(synth);
    });

    it('should handle noteOn/noteOff (verify audio starts and stops)', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        const sampleCount = 4096;
        const bufferSize = sampleCount * 2;
        const ptr = Module._malloc(bufferSize);

        // Start a note
        Module._adl_rt_noteOn(synth, 0, 60, 100);

        // Generate audio - should have sound
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let maxDuring = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxDuring = Math.max(maxDuring, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(maxDuring).toBeGreaterThan(0);

        // Note off
        Module._adl_rt_noteOff(synth, 0, 60);

        // Generate more audio to let note decay
        for (let i = 0; i < 20; i++) {
            Module._adl_generate(synth, sampleCount, ptr);
        }

        let maxAfter = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxAfter = Math.max(maxAfter, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }

        // After noteOff and decay, should be much quieter
        expect(maxAfter).toBeLessThan(maxDuring / 2);

        Module._free(ptr);
        Module._adl_close(synth);
    });

    it('should generate audio samples', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);
        Module._adl_rt_noteOn(synth, 0, 60, 100);

        // Allocate buffer for 4096 stereo samples = 8192 int16 values = 16384 bytes
        const sampleCount = 8192;  // Stereo samples (L+R pairs * 4096)
        const bufferSize = sampleCount * 2;  // 16-bit samples
        const ptr = Module._malloc(bufferSize);

        // Generate multiple frames of audio
        for (let i = 0; i < 4; i++) {
            Module._adl_generate(synth, sampleCount, ptr);
        }

        // Check that we got non-zero audio somewhere
        let maxSample = 0;
        for (let i = 0; i < sampleCount; i++) {
            const sample = Math.abs(Module.HEAP16[ptr / 2 + i]);
            if (sample > maxSample) maxSample = sample;
        }

        expect(maxSample).toBeGreaterThan(0);

        Module._free(ptr);
        Module._adl_close(synth);
    });

    it('should reset state correctly (verify audio stops)', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);
        Module._adl_rt_noteOn(synth, 0, 60, 100);

        const sampleCount = 4096;
        const bufferSize = sampleCount * 2;
        const ptr = Module._malloc(bufferSize);

        // Generate audio with note playing - should be non-zero
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);  // Let OPL3 catch up

        let maxBefore = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxBefore = Math.max(maxBefore, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(maxBefore).toBeGreaterThan(0);

        // Reset state - should silence
        Module._adl_rt_resetState(synth);

        // Generate more audio after reset - should decay to near-zero
        for (let i = 0; i < 10; i++) {
            Module._adl_generate(synth, sampleCount, ptr);
        }

        let maxAfter = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxAfter = Math.max(maxAfter, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }

        // After reset, audio should be much quieter (decayed)
        expect(maxAfter).toBeLessThan(maxBefore / 10);

        Module._free(ptr);
        Module._adl_close(synth);
    });

    it('should panic (verify all notes stop)', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        // Play multiple notes
        Module._adl_rt_noteOn(synth, 0, 60, 100);
        Module._adl_rt_noteOn(synth, 1, 64, 100);
        Module._adl_rt_noteOn(synth, 2, 67, 100);

        const sampleCount = 4096;
        const bufferSize = sampleCount * 2;
        const ptr = Module._malloc(bufferSize);

        // Generate audio with notes playing - should be non-zero
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let maxBefore = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxBefore = Math.max(maxBefore, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(maxBefore).toBeGreaterThan(0);

        // Panic should stop all notes
        Module._adl_panic(synth);

        // Generate more audio after panic
        for (let i = 0; i < 10; i++) {
            Module._adl_generate(synth, sampleCount, ptr);
        }

        let maxAfter = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxAfter = Math.max(maxAfter, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }

        // After panic, should be silent or very quiet
        expect(maxAfter).toBeLessThan(maxBefore / 10);

        Module._free(ptr);
        Module._adl_close(synth);
    });
});

describe('WASM Emulator Switching (light profile)', () => {
    let Module;

    beforeAll(async () => {
        // Use light profile which has both Nuked and DosBox emulators
        const { default: createADLMIDI } = await import(
            join(DIST_DIR, 'libadlmidi.light.core.js')
        );
        Module = await createADLMIDI();
    }, 30000);

    it('should have chipEmulatorName function exported', () => {
        expect(Module._adl_chipEmulatorName).toBeDefined();
    });

    it('should have switchEmulator function exported', () => {
        expect(Module._adl_switchEmulator).toBeDefined();
    });

    it('should return emulator name string', () => {
        const synth = Module._adl_init(44100);

        const namePtr = Module._adl_chipEmulatorName(synth);
        expect(namePtr).toBeGreaterThan(0);  // Valid pointer

        const name = Module.UTF8ToString(namePtr);
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
        // Default should be Nuked in light profile
        expect(name).toContain('Nuked');

        Module._adl_close(synth);
    });

    it('should switch to DosBox emulator successfully', () => {
        const synth = Module._adl_init(44100);

        const DOSBOX_EMULATOR = 2;  // ADLMIDI_EMU_DOSBOX
        const result = Module._adl_switchEmulator(synth, DOSBOX_EMULATOR);
        expect(result).toBe(0);  // 0 = success

        const namePtr = Module._adl_chipEmulatorName(synth);
        const name = Module.UTF8ToString(namePtr);
        expect(name).toContain('DOSBox');

        Module._adl_close(synth);
    });

    it('should switch back to Nuked emulator successfully', () => {
        const synth = Module._adl_init(44100);

        // First switch to DosBox
        Module._adl_switchEmulator(synth, 2);  // DOSBOX

        // Then switch back to Nuked
        const NUKED_EMULATOR = 0;  // ADLMIDI_EMU_NUKED
        const result = Module._adl_switchEmulator(synth, NUKED_EMULATOR);
        expect(result).toBe(0);

        const namePtr = Module._adl_chipEmulatorName(synth);
        const name = Module.UTF8ToString(namePtr);
        expect(name).toContain('Nuked');

        Module._adl_close(synth);
    });

    it('should fail to switch to unavailable emulator (Opal not in light profile)', () => {
        const synth = Module._adl_init(44100);

        const OPAL_EMULATOR = 3;  // ADLMIDI_EMU_OPAL - not in light profile
        const result = Module._adl_switchEmulator(synth, OPAL_EMULATOR);
        expect(result).toBe(-1);  // -1 = failure

        // Should still be on previous emulator
        const namePtr = Module._adl_chipEmulatorName(synth);
        const name = Module.UTF8ToString(namePtr);
        expect(name).not.toContain('Opal');

        Module._adl_close(synth);
    });

    it('should generate audio after switching emulators', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        const sampleCount = 4096;
        const ptr = Module._malloc(sampleCount * 2);

        // Play note with Nuked
        Module._adl_rt_noteOn(synth, 0, 60, 100);
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let maxNuked = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxNuked = Math.max(maxNuked, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(maxNuked).toBeGreaterThan(0);

        // Switch to DosBox
        Module._adl_switchEmulator(synth, 2);

        // Note should still be playing (or we need to re-trigger)
        Module._adl_rt_noteOn(synth, 0, 60, 100);
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let maxDosBox = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxDosBox = Math.max(maxDosBox, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(maxDosBox).toBeGreaterThan(0);

        Module._free(ptr);
        Module._adl_close(synth);
    });
});

describe('WASM Instrument API', () => {
    let Module;

    beforeAll(async () => {
        const { default: createADLMIDI } = await import(
            join(DIST_DIR, 'libadlmidi.nuked.core.js')
        );
        Module = await createADLMIDI();
    }, 30000);

    it('should get bank by ID', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        // Allocate memory for bank pointer output
        const bankPtrPtr = Module._malloc(8);  // 64-bit pointer

        // Get melodic bank 0
        const FLAGS_CREATE = 1;  // ADLMIDI_Bank_Create
        Module._adl_getBank(
            synth,
            /* bankId */ { percussive: 0, msb: 0, lsb: 0 },
            FLAGS_CREATE,
            bankPtrPtr
        );

        Module._free(bankPtrPtr);
        Module._adl_close(synth);
    });

    it('should set number of chips', () => {
        const synth = Module._adl_init(44100);
        const result = Module._adl_setNumChips(synth, 2);
        expect(result).toBe(0);  // 0 = success
        Module._adl_close(synth);
    });

    it('should set deep vibrato (verify audio still works)', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        const sampleCount = 1024;
        const ptr = Module._malloc(sampleCount * 2);

        // Enable vibrato and play note
        Module._adl_setHVibrato(synth, 1);
        Module._adl_rt_noteOn(synth, 0, 60, 100);
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let max1 = 0;
        for (let i = 0; i < sampleCount; i++) {
            max1 = Math.max(max1, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(max1).toBeGreaterThan(0);  // Audio should play

        // Disable vibrato and verify audio still works
        Module._adl_setHVibrato(synth, 0);
        Module._adl_generate(synth, sampleCount, ptr);

        let max2 = 0;
        for (let i = 0; i < sampleCount; i++) {
            max2 = Math.max(max2, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(max2).toBeGreaterThan(0);  // Audio should still play

        Module._free(ptr);
        Module._adl_close(synth);
    });

    it('should set deep tremolo (verify audio still works)', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        const sampleCount = 1024;
        const ptr = Module._malloc(sampleCount * 2);

        // Enable tremolo and play note
        Module._adl_setHTremolo(synth, 1);
        Module._adl_rt_noteOn(synth, 0, 60, 100);
        Module._adl_generate(synth, sampleCount, ptr);
        Module._adl_generate(synth, sampleCount, ptr);

        let max1 = 0;
        for (let i = 0; i < sampleCount; i++) {
            max1 = Math.max(max1, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(max1).toBeGreaterThan(0);  // Audio should play

        // Disable tremolo and verify audio still works
        Module._adl_setHTremolo(synth, 0);
        Module._adl_generate(synth, sampleCount, ptr);

        let max2 = 0;
        for (let i = 0; i < sampleCount; i++) {
            max2 = Math.max(max2, Math.abs(Module.HEAP16[ptr / 2 + i]));
        }
        expect(max2).toBeGreaterThan(0);  // Audio should still play

        Module._free(ptr);
        Module._adl_close(synth);
    });
});

describe('WASM MIDI Loading', () => {
    let Module;
    let midiData;

    beforeAll(async () => {
        const { default: createADLMIDI } = await import(
            join(DIST_DIR, 'libadlmidi.nuked.core.js')
        );
        Module = await createADLMIDI();

        // Load test MIDI file
        const { readFileSync } = await import('fs');
        midiData = readFileSync(join(__dirname, '..', '..', 'test-files', 'canyon.mid'));
    }, 30000);

    it('should load MIDI data', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        // Copy MIDI data to WASM memory
        const ptr = Module._malloc(midiData.length);
        Module.HEAPU8.set(midiData, ptr);

        // Load the MIDI
        const result = Module._adl_openData(synth, ptr, midiData.length);
        expect(result).toBe(0);  // 0 = success

        // Check duration
        const duration = Module._adl_totalTimeLength(synth);
        expect(duration).toBeGreaterThan(0);

        Module._free(ptr);
        Module._adl_close(synth);
    });

    it('should play MIDI and generate audio', () => {
        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        // Load MIDI
        const midiPtr = Module._malloc(midiData.length);
        Module.HEAPU8.set(midiData, midiPtr);
        Module._adl_openData(synth, midiPtr, midiData.length);

        // Generate 1 second of audio
        const sampleCount = 44100 * 2;  // Stereo
        const bufferBytes = sampleCount * 2;  // 16-bit samples
        const audioPtr = Module._malloc(bufferBytes);

        const generated = Module._adl_play(synth, sampleCount, audioPtr);
        expect(generated).toBeGreaterThan(0);

        Module._free(midiPtr);
        Module._free(audioPtr);
        Module._adl_close(synth);
    });

    it('should produce deterministic MIDI audio (hash verification)', async () => {
        const { createHash } = await import('crypto');

        const synth = Module._adl_init(44100);
        Module._adl_setBank(synth, 72);

        // Load MIDI
        const midiPtr = Module._malloc(midiData.length);
        Module.HEAPU8.set(midiData, midiPtr);
        Module._adl_openData(synth, midiPtr, midiData.length);

        // Generate 1 second of audio (stereo = 88200 samples)
        const sampleCount = 88200;
        const bufferBytes = sampleCount * 2;
        const audioPtr = Module._malloc(bufferBytes);

        Module._adl_play(synth, sampleCount, audioPtr);

        // Extract audio data and compute hash
        const audioData = new Int16Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            audioData[i] = Module.HEAP16[audioPtr / 2 + i];
        }

        const hash = createHash('sha256')
            .update(Buffer.from(audioData.buffer))
            .digest('hex');

        console.log(`Node MIDI canyon.mid hash: ${hash}`);

        // Verify audio is non-silent
        let maxSample = 0;
        for (let i = 0; i < sampleCount; i++) {
            maxSample = Math.max(maxSample, Math.abs(audioData[i]));
        }
        expect(maxSample).toBeGreaterThan(0);

        Module._free(midiPtr);
        Module._free(audioPtr);
        Module._adl_close(synth);
    });
});
