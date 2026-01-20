/**
 * Tests for AdlMidiCore low-level synthesis interface
 *
 * These tests verify the platform-agnostic core API works correctly
 * for Node.js / non-browser use cases.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', '..', 'dist');
const CORE_PATH = join(DIST_DIR, 'libadlmidi.nuked.core.js');
const LIGHT_CORE_PATH = join(DIST_DIR, 'libadlmidi.light.core.js');

// Dynamic import of AdlMidiCore
let AdlMidiCore;
beforeAll(async () => {
    const module = await import('../../src/core.js');
    AdlMidiCore = module.AdlMidiCore;
});

describe('AdlMidiCore Lifecycle', () => {
    let synth;

    afterEach(() => {
        if (synth) {
            synth.close();
            synth = null;
        }
    });

    it('should create instance with corePath', async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        expect(synth).toBeDefined();
        expect(synth.module).toBeDefined();
    });

    it('should throw if no corePath provided', async () => {
        await expect(AdlMidiCore.create({})).rejects.toThrow('corePath');
    });

    it('should initialize with sample rate', async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(48000);
        expect(synth.sampleRate).toBe(48000);
    });

    it('should throw if not initialized', async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        expect(() => synth.noteOn(0, 60, 100)).toThrow('not initialized');
    });

    it('should close without error', async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(44100);
        synth.close();
        // Should not throw if closed again
        synth.close();
    });
});

describe('AdlMidiCore Configuration', () => {
    let synth;

    beforeAll(async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(44100);
    });

    afterEach(() => {
        synth?.reset();
    });

    it('should get bank count', () => {
        const count = synth.getBankCount();
        expect(count).toBeGreaterThan(0);
    });

    it('should get embedded banks with names', () => {
        const banks = synth.getEmbeddedBanks();
        expect(banks.length).toBeGreaterThan(0);
        expect(banks[0]).toHaveProperty('id');
        expect(banks[0]).toHaveProperty('name');
        expect(typeof banks[0].id).toBe('number');
        expect(typeof banks[0].name).toBe('string');
        expect(banks[0].id).toBe(0);
        // Bank 72 should exist and have a name
        const bank72 = banks.find(b => b.id === 72);
        expect(bank72).toBeDefined();
        expect(bank72.name).toBeTruthy();
    });

    it('should set bank successfully', () => {
        expect(synth.setBank(72)).toBe(true);
    });

    it('should set number of chips', () => {
        expect(synth.setNumChips(4)).toBe(true);
    });

    it('should set soft pan', () => {
        synth.setSoftPan(true);
        synth.setSoftPan(false);
        // No error = success
    });

    it('should set deep vibrato', () => {
        synth.setDeepVibrato(true);
        synth.setDeepVibrato(false);
    });

    it('should set deep tremolo', () => {
        synth.setDeepTremolo(true);
        synth.setDeepTremolo(false);
    });

    it('should get number of chips', () => {
        const chips = synth.getNumChips();
        expect(typeof chips).toBe('number');
        expect(chips).toBeGreaterThan(0);
    });

    it('should get number of chips obtained', () => {
        const chips = synth.getNumChipsObtained();
        expect(typeof chips).toBe('number');
        expect(chips).toBeGreaterThan(0);
    });

    it('should set and get volume model', () => {
        synth.setVolumeModel(2); // ADLMIDI_VolumeModel_NativeOPL3
        const model = synth.getVolumeModel();
        expect(model).toBe(2);
    });

    it('should set run at PCM rate', () => {
        const result = synth.setRunAtPcmRate(true);
        expect(result).toBe(true);
        synth.setRunAtPcmRate(false);
    });

    it('should handle advanced configuration', () => {
        // 4-op channels
        expect(synth.setNumFourOpChannels(2)).toBe(true);
        expect(synth.getNumFourOpChannels()).toBe(2);
        synth.setNumFourOpChannels(-1); // Reset to auto

        // Modulators
        synth.setScaleModulators(true);
        synth.setScaleModulators(false);

        // Full range brightness
        synth.setFullRangeBrightness(true);
        synth.setFullRangeBrightness(false);

        // Auto arpeggio
        synth.setAutoArpeggio(true);
        expect(synth.getAutoArpeggio()).toBe(true);
        synth.setAutoArpeggio(false);
        expect(synth.getAutoArpeggio()).toBe(false);

        // Channel alloc mode
        synth.setChannelAllocMode(1); // ADLMIDI_ChanAlloc_OffDelay
        expect(synth.getChannelAllocMode()).toBe(1);
    });

    it('should get and set instrument safely', () => {
        const bankId = { percussive: 0, msb: 0, lsb: 0 };
        const program = 0;

        // 1. Get initial instrument
        const originalInst = synth.getInstrument(bankId, program);
        expect(originalInst).toBeDefined();
        expect(originalInst.version).toBeDefined();
        
        // 2. Modify it
        const modifiedInst = { ...originalInst };
        if (modifiedInst.operators && modifiedInst.operators[0]) {
             modifiedInst.operators[0].attack = (modifiedInst.operators[0].attack + 5) % 16;
        }

        // 3. Set it back (verify it returns true/success)
        const result = synth.setInstrument(bankId, program, modifiedInst);
        expect(result).toBe(true);

        // 4. Get it again (verify no crash and structure is valid)
        const retrievedInst = synth.getInstrument(bankId, program);
        expect(retrievedInst).toBeDefined();
        expect(retrievedInst.operators).toBeDefined();
    });
});

describe('AdlMidiCore Real-time Synthesis', () => {
    let synth;

    beforeAll(async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(44100);
        synth.setBank(72);
    });

    afterEach(() => {
        synth?.reset();
    });

    it('should play note and generate audio', () => {
        synth.noteOn(0, 60, 100);

        // Generate a few buffers to let OPL3 catch up
        synth.generate(1024);
        synth.generate(1024);
        const samples = synth.generate(1024);

        expect(samples).toBeInstanceOf(Float32Array);
        expect(samples.length).toBe(2048); // 1024 frames * 2 channels

        // Check for non-zero audio
        let maxSample = 0;
        for (let i = 0; i < samples.length; i++) {
            maxSample = Math.max(maxSample, Math.abs(samples[i]));
        }
        expect(maxSample).toBeGreaterThan(0);
    });

    it('should stop note with noteOff', () => {
        synth.noteOn(0, 60, 100);
        synth.generate(2048);
        synth.generate(2048);

        synth.noteOff(0, 60);

        // Let note decay
        for (let i = 0; i < 20; i++) {
            synth.generate(2048);
        }

        const samples = synth.generate(2048);
        let maxSample = 0;
        for (let i = 0; i < samples.length; i++) {
            maxSample = Math.max(maxSample, Math.abs(samples[i]));
        }

        // Should be mostly silent after decay
        expect(maxSample).toBeLessThan(0.1);
    });

    it('should handle pitch bend', () => {
        synth.noteOn(0, 60, 100);
        synth.pitchBend(0, 16383); // Max bend up
        synth.generate(1024);
        synth.pitchBend(0, 0); // Max bend down
        synth.generate(1024);
        // No errors = success
    });

    it('should handle controller change', () => {
        synth.controllerChange(0, 7, 100); // Volume
        synth.controllerChange(0, 10, 64); // Pan
        // No errors = success
    });

    it('should handle program change', () => {
        synth.programChange(0, 1); // Switch to program 1
        synth.noteOn(0, 60, 100);
        synth.generate(1024);
    });

    it('should reset and panic', () => {
        synth.noteOn(0, 60, 100);
        synth.noteOn(1, 64, 100);
        synth.generate(2048);

        synth.panic();

        // After panic, notes should stop
        for (let i = 0; i < 10; i++) {
            synth.generate(2048);
        }

        const samples = synth.generate(2048);
        let maxSample = 0;
        for (let i = 0; i < samples.length; i++) {
            maxSample = Math.max(maxSample, Math.abs(samples[i]));
        }
        expect(maxSample).toBeLessThan(0.01);
    });

    it('should handle bank changes', () => {
        // These are void functions, just check they don't throw
        synth.bankChange(0, 100);
        synth.bankChangeMSB(0, 120);
        synth.bankChangeLSB(0, 1);
    });

    it('should handle aftertouch', () => {
        synth.noteOn(0, 60, 100);
        synth.noteAfterTouch(0, 60, 50);
        synth.channelAfterTouch(0, 40);
        // No errors = success
    });
});

describe('AdlMidiCore MIDI Playback', () => {
    let synth;
    let midiData;

    beforeAll(async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(44100);
        synth.setBank(72);

        // Load test MIDI file
        midiData = readFileSync(join(__dirname, '..', '..', 'test-files', 'canyon.mid'));
    });

    afterEach(() => {
        synth?.rewind();
    });

    it('should load MIDI data', () => {
        expect(synth.loadMidi(midiData)).toBe(true);
    });

    it('should report duration', () => {
        synth.loadMidi(midiData);
        expect(synth.duration).toBeGreaterThan(0);
    });

    it('should play MIDI and generate audio', () => {
        synth.loadMidi(midiData);

        const samples = synth.play(4096);

        expect(samples).toBeInstanceOf(Float32Array);
        expect(samples.length).toBe(8192);

        // Should have audio
        let maxSample = 0;
        for (let i = 0; i < samples.length; i++) {
            maxSample = Math.max(maxSample, Math.abs(samples[i]));
        }
        expect(maxSample).toBeGreaterThan(0);
    });

    it('should track position', () => {
        synth.loadMidi(midiData);

        const startPos = synth.position;
        synth.play(44100); // 1 second of audio
        const endPos = synth.position;

        expect(endPos).toBeGreaterThan(startPos);
    });

    it('should seek', () => {
        synth.loadMidi(midiData);

        synth.seek(5.0);
        expect(synth.position).toBeCloseTo(5.0, 0);
    });

    it('should rewind', () => {
        synth.loadMidi(midiData);

        synth.play(44100);
        synth.rewind();

        expect(synth.position).toBe(0);
    });

    it('should set looping', () => {
        synth.loadMidi(midiData);
        synth.setLooping(true);
        synth.setLooping(false);
    });

    it('should set tempo', () => {
        synth.loadMidi(midiData);
        synth.setTempo(2.0); // Double speed
        synth.setTempo(1.0);
    });

    it('should get music title', () => {
        synth.loadMidi(midiData);
        // canyon.mid typically has "Canyon.mid" or similar as title, or sometimes empty depending on how it's parsed
        // We just check it's a string and doesn't crash
        const title = synth.getMusicTitle();
        expect(typeof title).toBe('string');
    });

    it('should get music copyright', () => {
        synth.loadMidi(midiData);
        const copyright = synth.getMusicCopyright();
        expect(typeof copyright).toBe('string');
    });
});

describe('AdlMidiCore Emulator Switching', () => {
    let synth;

    beforeAll(async () => {
        // Use light profile which has multiple emulators
        synth = await AdlMidiCore.create({ corePath: LIGHT_CORE_PATH });
        synth.init(44100);
    });

    it('should get emulator name', () => {
        const name = synth.getEmulatorName();
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
    });

    it('should switch to DosBox emulator', () => {
        const result = synth.switchEmulator(2); // ADLMIDI_EMU_DOSBOX
        expect(result).toBe(true);
        expect(synth.getEmulatorName()).toContain('DOSBox');
    });

    it('should switch back to Nuked', () => {
        const result = synth.switchEmulator(0); // ADLMIDI_EMU_NUKED
        expect(result).toBe(true);
        expect(synth.getEmulatorName()).toContain('Nuked');
    });
});

describe('AdlMidiCore Direct Module Access', () => {
    let synth;

    beforeAll(async () => {
        synth = await AdlMidiCore.create({ corePath: CORE_PATH });
        synth.init(44100);
    });

    it('should expose raw module', () => {
        expect(synth.module).toBeDefined();
        expect(synth.module._adl_init).toBeDefined();
        expect(synth.module.HEAP16).toBeDefined();
    });

    it('should expose player pointer', () => {
        expect(synth.player).toBeGreaterThan(0);
    });
});
