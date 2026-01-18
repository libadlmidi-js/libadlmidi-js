/**
 * Tests for OPL3 struct serialization/deserialization
 * 
 * These tests verify that Operator and Instrument structures
 * can be encoded and decoded correctly using the shared utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    SIZEOF_ADL_OPERATOR,
    SIZEOF_ADL_INSTRUMENT,
    OPERATOR_OFFSET,
    decodeOperator,
    encodeOperator,
} from '../../src/utils/struct.js';

describe('Operator Encoding', () => {
    it('should encode and decode operator roundtrip', () => {
        const original = {
            am: true,
            vibrato: false,
            sustaining: true,
            ksr: false,
            freqMult: 5,
            keyScaleLevel: 2,
            totalLevel: 32,
            attack: 12,
            decay: 4,
            sustain: 8,
            release: 6,
            waveform: 3,
        };

        const encoded = encodeOperator(original);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(original);
    });

    it('should handle all flags enabled', () => {
        const allFlags = {
            am: true,
            vibrato: true,
            sustaining: true,
            ksr: true,
            freqMult: 15,
            keyScaleLevel: 3,
            totalLevel: 63,
            attack: 15,
            decay: 15,
            sustain: 15,
            release: 15,
            waveform: 7,
        };

        const encoded = encodeOperator(allFlags);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(allFlags);
    });

    it('should handle all flags disabled / minimum values', () => {
        const noFlags = {
            am: false,
            vibrato: false,
            sustaining: false,
            ksr: false,
            freqMult: 0,
            keyScaleLevel: 0,
            totalLevel: 0,
            attack: 0,
            decay: 0,
            sustain: 0,
            release: 0,
            waveform: 0,
        };

        const encoded = encodeOperator(noFlags);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(noFlags);
    });

    it('should produce correct byte values', () => {
        const op = {
            am: true,         // 0x80
            vibrato: true,    // 0x40
            sustaining: false,
            ksr: false,
            freqMult: 1,      // 0x01
            keyScaleLevel: 0,
            totalLevel: 20,   // 0x14
            attack: 15,       // 0xF0
            decay: 8,         // 0x08
            sustain: 2,       // 0x20
            release: 6,       // 0x06
            waveform: 1,      // 0x01
        };

        const bytes = encodeOperator(op);

        expect(bytes[0]).toBe(0xC1); // 0x80 | 0x40 | 0x01
        expect(bytes[1]).toBe(0x14); // totalLevel = 20
        expect(bytes[2]).toBe(0xF8); // attack=15, decay=8
        expect(bytes[3]).toBe(0x26); // sustain=2, release=6
        expect(bytes[4]).toBe(0x01); // waveform=1
    });
});

describe('Struct Sizes', () => {
    it('should have correct operator size', () => {
        expect(SIZEOF_ADL_OPERATOR).toBe(5);
    });

    it('should have correct instrument size', () => {
        expect(SIZEOF_ADL_INSTRUMENT).toBe(40);
    });

    it('should have operators at correct offset', () => {
        // After: version(2) + flags(2) + percNote(1) + padding(1) + 
        //        noteOff1(1) + noteOff2(1) + velOff(1) + detune(1) +
        //        fb_conn1(1) + fb_conn2(1) + padding(2) = 14 bytes
        expect(OPERATOR_OFFSET).toBe(14);
    });

    it('should fit 4 operators between offset and delays', () => {
        // After operators: delays at offset 34 (2 bytes each = 4 bytes)
        // So operators take: 34 - 14 = 20 bytes = 4 * 5 ✓
        const operatorsTotalSize = 34 - OPERATOR_OFFSET;
        expect(operatorsTotalSize).toBe(4 * SIZEOF_ADL_OPERATOR);
    });
});
