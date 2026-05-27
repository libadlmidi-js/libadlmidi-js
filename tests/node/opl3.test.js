import { describe, it, expect } from 'vitest';
import {
    CHANNELS_PER_CHIP,
    CHANNELS_STANDARD,
    CHANNELS_RHYTHM,
    OPL3_SAMPLE_RATE,
    CHANNEL_OPERATORS,
    channelBank,
    fnumLoReg,
    keyOnBlockReg,
    feedbackConnReg,
    operatorReg,
    noteToFnumBlock,
    encodeFnumBlock,
    keyOn,
    keyOff,
    encodeOperatorRegisters,
    encodeChannelVoice,
    channelMask,
} from '../../src/utils/opl3.js';
import { defaultOperator } from '../../src/utils/struct.js';

describe('OPL3 Constants', () => {
    it('should have correct channel counts', () => {
        expect(CHANNELS_PER_CHIP).toBe(23);
        expect(CHANNELS_STANDARD).toBe(18);
        expect(CHANNELS_RHYTHM).toBe(5);
    });

    it('should have correct clock rate', () => {
        expect(OPL3_SAMPLE_RATE).toBe(49716);
    });

    it('should have 18 channel operator pairs', () => {
        expect(CHANNEL_OPERATORS).toHaveLength(18);
        for (const pair of CHANNEL_OPERATORS) {
            expect(pair).toHaveLength(2);
        }
    });
});

describe('CHANNEL_OPERATORS', () => {
    it('should match Nuked OPL3 ch_slot/ad_slot tables', () => {
        // From nukedopl3.c: ch_slot[18] and ad_slot[0x20]
        // Channel slot pairs are ch_slot[n] and ch_slot[n]+3
        // Register offsets are the inverse of the ad_slot mapping
        const expected = [
            [0x00, 0x03], [0x01, 0x04], [0x02, 0x05],
            [0x08, 0x0B], [0x09, 0x0C], [0x0A, 0x0D],
            [0x10, 0x13], [0x11, 0x14], [0x12, 0x15],
            [0x00, 0x03], [0x01, 0x04], [0x02, 0x05],
            [0x08, 0x0B], [0x09, 0x0C], [0x0A, 0x0D],
            [0x10, 0x13], [0x11, 0x14], [0x12, 0x15],
        ];
        for (let i = 0; i < 18; i++) {
            expect(CHANNEL_OPERATORS[i][0]).toBe(expected[i][0]);
            expect(CHANNEL_OPERATORS[i][1]).toBe(expected[i][1]);
        }
    });

    it('should be frozen', () => {
        expect(Object.isFrozen(CHANNEL_OPERATORS)).toBe(true);
        for (const pair of CHANNEL_OPERATORS) {
            expect(Object.isFrozen(pair)).toBe(true);
        }
    });
});

describe('channelBank', () => {
    it('should return 0x000 for channels 0-8', () => {
        for (let ch = 0; ch <= 8; ch++) {
            expect(channelBank(ch)).toBe(0x000);
        }
    });

    it('should return 0x100 for channels 9-17', () => {
        for (let ch = 9; ch <= 17; ch++) {
            expect(channelBank(ch)).toBe(0x100);
        }
    });
});

describe('Register address functions', () => {
    it('fnumLoReg should return 0xA0 + offset for bank 0', () => {
        expect(fnumLoReg(0)).toBe(0xA0);
        expect(fnumLoReg(3)).toBe(0xA3);
        expect(fnumLoReg(8)).toBe(0xA8);
    });

    it('fnumLoReg should return 0x1A0 + offset for bank 1', () => {
        expect(fnumLoReg(9)).toBe(0x1A0);
        expect(fnumLoReg(12)).toBe(0x1A3);
        expect(fnumLoReg(17)).toBe(0x1A8);
    });

    it('keyOnBlockReg should return 0xB0 + offset', () => {
        expect(keyOnBlockReg(0)).toBe(0xB0);
        expect(keyOnBlockReg(8)).toBe(0xB8);
        expect(keyOnBlockReg(9)).toBe(0x1B0);
        expect(keyOnBlockReg(17)).toBe(0x1B8);
    });

    it('feedbackConnReg should return 0xC0 + offset', () => {
        expect(feedbackConnReg(0)).toBe(0xC0);
        expect(feedbackConnReg(8)).toBe(0xC8);
        expect(feedbackConnReg(9)).toBe(0x1C0);
        expect(feedbackConnReg(17)).toBe(0x1C8);
    });
});

describe('operatorReg', () => {
    it('should combine base register with operator offset and bank', () => {
        expect(operatorReg(0x20, 0, 0)).toBe(0x20);
        expect(operatorReg(0x20, 0, 1)).toBe(0x23);
        expect(operatorReg(0x40, 3, 0)).toBe(0x48);
        expect(operatorReg(0x40, 3, 1)).toBe(0x4B);
        expect(operatorReg(0xE0, 6, 0)).toBe(0xF0);
        expect(operatorReg(0xE0, 6, 1)).toBe(0xF3);
    });

    it('should add 0x100 for channels 9-17', () => {
        expect(operatorReg(0x20, 9, 0)).toBe(0x120);
        expect(operatorReg(0x20, 9, 1)).toBe(0x123);
        expect(operatorReg(0x80, 17, 0)).toBe(0x192);
        expect(operatorReg(0x80, 17, 1)).toBe(0x195);
    });
});

describe('noteToFnumBlock', () => {
    it('should produce fnum <= 1023 for all MIDI notes', () => {
        for (let note = 0; note <= 127; note++) {
            const { fnum, block } = noteToFnumBlock(note);
            expect(fnum).toBeGreaterThanOrEqual(0);
            expect(fnum).toBeLessThanOrEqual(1023);
            expect(block).toBeGreaterThanOrEqual(0);
            expect(block).toBeLessThanOrEqual(7);
        }
    });

    it('should produce reasonable fnum for A4 (MIDI 69, 440 Hz)', () => {
        const { fnum, block } = noteToFnumBlock(69);
        const freq = fnum * OPL3_SAMPLE_RATE / Math.pow(2, 20 - block);
        expect(Math.abs(freq - 440)).toBeLessThan(1);
    });

    it('should produce higher block for higher notes', () => {
        const low = noteToFnumBlock(36);
        const high = noteToFnumBlock(96);
        expect(high.block).toBeGreaterThan(low.block);
    });

    it('should saturate for very high notes', () => {
        const result = noteToFnumBlock(127);
        expect(result.block).toBe(7);
    });
});

describe('encodeFnumBlock', () => {
    it('should split fnum into low byte and high bits', () => {
        const { fnumLo, fnumHiBlock } = encodeFnumBlock(0x1AB, 4);
        expect(fnumLo).toBe(0xAB);
        expect(fnumHiBlock & 0x03).toBe(0x01);
        expect((fnumHiBlock >> 2) & 0x07).toBe(4);
    });

    it('should not include key-on bit', () => {
        const { fnumHiBlock } = encodeFnumBlock(1023, 7);
        expect(fnumHiBlock & 0x20).toBe(0);
    });
});

describe('keyOn / keyOff', () => {
    it('keyOn should set bit 5 on the B0 register value', () => {
        const result = keyOn(0, 580, 4);
        expect(result.reg).toBe(0xB0);
        expect(result.value & 0x20).toBe(0x20);
    });

    it('keyOff should clear bit 5 on the B0 register value', () => {
        const result = keyOff(0, 580, 4);
        expect(result.reg).toBe(0xB0);
        expect(result.value & 0x20).toBe(0);
    });

    it('should preserve fnum and block in both', () => {
        const on = keyOn(0, 0x1AB, 3);
        const off = keyOff(0, 0x1AB, 3);
        expect(on.value & ~0x20).toBe(off.value);
    });

    it('should use correct register for channel 9+', () => {
        const result = keyOn(9, 580, 4);
        expect(result.reg).toBe(0x1B0);
    });
});

describe('encodeOperatorRegisters', () => {
    const testOp = {
        am: true,
        vibrato: false,
        sustaining: true,
        ksr: false,
        freqMult: 5,
        keyScaleLevel: 2,
        totalLevel: 32,
        attack: 15,
        decay: 7,
        sustain: 3,
        release: 9,
        waveform: 2,
    };

    it('should produce 5 register writes', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        expect(writes).toHaveLength(5);
    });

    it('should encode 0x20 register correctly', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        const reg20 = writes[0];
        expect(reg20.reg).toBe(0x20);
        expect(reg20.value).toBe(
            (1 << 7) | (0 << 6) | (1 << 5) | (0 << 4) | 5
        );
    });

    it('should encode 0x40 register correctly', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        const reg40 = writes[1];
        expect(reg40.reg).toBe(0x40);
        expect(reg40.value).toBe((2 << 6) | 32);
    });

    it('should encode 0x60 register correctly', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        const reg60 = writes[2];
        expect(reg60.reg).toBe(0x60);
        expect(reg60.value).toBe((15 << 4) | 7);
    });

    it('should encode 0x80 register correctly', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        const reg80 = writes[3];
        expect(reg80.reg).toBe(0x80);
        expect(reg80.value).toBe((3 << 4) | 9);
    });

    it('should encode 0xE0 register correctly', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 0);
        const regE0 = writes[4];
        expect(regE0.reg).toBe(0xE0);
        expect(regE0.value).toBe(2);
    });

    it('should use carrier offset for slot 1', () => {
        const writes = encodeOperatorRegisters(testOp, 0, 1);
        expect(writes[0].reg).toBe(0x23);
        expect(writes[1].reg).toBe(0x43);
    });

    it('should add bank bit for channel 9+', () => {
        const writes = encodeOperatorRegisters(testOp, 9, 0);
        expect(writes[0].reg).toBe(0x120);
    });
});

describe('encodeChannelVoice', () => {
    const testInstrument = {
        is4op: false,
        isPseudo4op: false,
        isBlank: false,
        noteOffset1: 0,
        connection1: 0,
        feedback1: 5,
        operators: [
            {
                am: false, vibrato: false, sustaining: false, ksr: false,
                attack: 15, decay: 3, sustain: 2, release: 4,
                totalLevel: 0, keyScaleLevel: 0, freqMult: 1, waveform: 0,
            },
            {
                am: false, vibrato: false, sustaining: false, ksr: false,
                attack: 15, decay: 2, sustain: 3, release: 4,
                totalLevel: 28, keyScaleLevel: 0, freqMult: 2, waveform: 0,
            },
            defaultOperator(),
            defaultOperator(),
        ],
    };

    it('should produce 11 register writes (5 + 5 + C0)', () => {
        const writes = encodeChannelVoice(testInstrument, 0);
        expect(writes).toHaveLength(11);
    });

    it('should map operators[1] (modulator) to slot 0 and operators[0] (carrier) to slot 1', () => {
        const writes = encodeChannelVoice(testInstrument, 0);
        // First 5 writes = modulator (operators[1]) at slot 0 offset (0x00)
        expect(writes[0].reg).toBe(0x20);
        // operators[1] has freqMult=2
        expect(writes[0].value & 0x0F).toBe(2);
        // Next 5 writes = carrier (operators[0]) at slot 1 offset (0x03)
        expect(writes[5].reg).toBe(0x23);
        // operators[0] has freqMult=1
        expect(writes[5].value & 0x0F).toBe(1);
    });

    it('should set stereo output bits (0x30) on C0 register', () => {
        const writes = encodeChannelVoice(testInstrument, 0);
        const c0 = writes[10];
        expect(c0.reg).toBe(0xC0);
        expect(c0.value & 0x30).toBe(0x30);
    });

    it('should encode feedback and connection in C0', () => {
        const writes = encodeChannelVoice(testInstrument, 0);
        const c0 = writes[10];
        expect((c0.value >> 1) & 0x07).toBe(5);
        expect(c0.value & 0x01).toBe(0);
    });

    it('should use correct registers for channel 9', () => {
        const writes = encodeChannelVoice(testInstrument, 9);
        // Modulator (operators[1]) at slot 0 + bank 1
        expect(writes[0].reg).toBe(0x120);
        // Carrier (operators[0]) at slot 1 + bank 1
        expect(writes[5].reg).toBe(0x123);
        expect(writes[10].reg).toBe(0x1C0);
    });

    it('should throw on 4-op instruments', () => {
        const inst4op = { ...testInstrument, is4op: true };
        expect(() => encodeChannelVoice(inst4op, 0)).toThrow('2-op');
    });

    it('should throw on pseudo-4-op instruments', () => {
        const instPseudo = { ...testInstrument, isPseudo4op: true };
        expect(() => encodeChannelVoice(instPseudo, 0)).toThrow('2-op');
    });
});

describe('channelMask', () => {
    it('should produce correct single-bit masks', () => {
        expect(channelMask(0)).toBe(1);
        expect(channelMask(1)).toBe(2);
        expect(channelMask(22)).toBe(0x400000);
    });

    it('should combine multiple channels', () => {
        expect(channelMask(0, 1)).toBe(3);
        expect(channelMask(0, 1, 2)).toBe(7);
    });

    it('should return 0 with no arguments', () => {
        expect(channelMask()).toBe(0);
    });

    it('should produce unsigned 32-bit result', () => {
        const mask = channelMask(31);
        expect(mask).toBe(2147483648);
        expect(mask > 0).toBe(true);
    });
});
