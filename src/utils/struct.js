/**
 * OPL3 struct serialization utilities
 * Shared between processor and tests
 * 
 * @module utils/struct
 */

// =============================================================================
// Structure Sizes (verified with offsetof() - WASM is 32-bit)
// =============================================================================

/** Size of ADL_Operator struct (5 register bytes) */
export const SIZEOF_ADL_OPERATOR = 5;

/** Size of ADL_Instrument struct */
export const SIZEOF_ADL_INSTRUMENT = 40;  // Verified: ops at offset 14, delay at 34/36

/** Size of ADL_Bank struct (3 pointers × 4 bytes in 32-bit WASM) */
export const SIZEOF_ADL_BANK = 12;

/** Size of ADL_BankId struct (3 bytes + padding) */
export const SIZEOF_ADL_BANK_ID = 4;

/** Offset where operators start within ADL_Instrument */
export const OPERATOR_OFFSET = 14;

// =============================================================================
// Operator Encoding/Decoding
// =============================================================================

/**
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
 * Decode an OPL3 operator from raw register bytes to named properties
 * @param {Uint8Array | number[]} bytes - 5 bytes of operator register data
 * @returns {Operator} Decoded operator with named properties
 */
export function decodeOperator(bytes) {
    const avekf = bytes[0];
    const ksl_l = bytes[1];
    const atdec = bytes[2];
    const susrel = bytes[3];
    const waveform = bytes[4];

    return {
        // Register 0x20: AM/Vib/EG-type/KSR/Mult
        am: !!(avekf & 0x80),
        vibrato: !!(avekf & 0x40),
        sustaining: !!(avekf & 0x20),
        ksr: !!(avekf & 0x10),
        freqMult: avekf & 0x0F,

        // Register 0x40: KSL/TL
        keyScaleLevel: (ksl_l >> 6) & 0x03,
        totalLevel: ksl_l & 0x3F,

        // Register 0x60: AR/DR
        attack: (atdec >> 4) & 0x0F,
        decay: atdec & 0x0F,

        // Register 0x80: SL/RR
        sustain: (susrel >> 4) & 0x0F,
        release: susrel & 0x0F,

        // Register 0xE0: Waveform
        waveform: waveform & 0x07
    };
}

/**
 * Encode named operator properties to raw register bytes
 * @param {Operator} op - Operator with named properties
 * @returns {Uint8Array} 5 bytes of operator register data
 */
export function encodeOperator(op) {
    const avekf =
        (op.am ? 0x80 : 0) |
        (op.vibrato ? 0x40 : 0) |
        (op.sustaining ? 0x20 : 0) |
        (op.ksr ? 0x10 : 0) |
        (op.freqMult & 0x0F);

    const ksl_l = ((op.keyScaleLevel & 0x03) << 6) | (op.totalLevel & 0x3F);
    const atdec = ((op.attack & 0x0F) << 4) | (op.decay & 0x0F);
    const susrel = ((op.sustain & 0x0F) << 4) | (op.release & 0x0F);
    const waveform = op.waveform & 0x07;

    return new Uint8Array([avekf, ksl_l, atdec, susrel, waveform]);
}

/**
 * Default operator values (silent)
 * @returns {Operator} A silent operator configuration
 */
export function defaultOperator() {
    return {
        am: false,
        vibrato: false,
        sustaining: true,
        ksr: false,
        freqMult: 1,
        keyScaleLevel: 0,
        totalLevel: 63, // Max attenuation (silent)
        attack: 15,
        decay: 0,
        sustain: 0,
        release: 15,
        waveform: 0
    };
}
