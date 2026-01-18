/**
 * Zero-config light (slim) profile for libADLMIDI-JS
 * 
 * Exports pre-configured AdlMidi and AdlMidiCore with this profile's WASM.
 * Slim builds require loading a WOPL bank at runtime.
 * 
 * @module profiles/light.slim
 */

import { AdlMidi as BaseAdlMidi } from '../libadlmidi.js';
import { AdlMidiCore as BaseAdlMidiCore } from '../core.js';

// Resolve paths relative to this module
const PROCESSOR_URL = new URL('../../dist/libadlmidi.light.slim.processor.js', import.meta.url).href;
const WASM_URL = new URL('../../dist/libadlmidi.light.slim.core.wasm', import.meta.url).href;
const CORE_PATH = new URL('../../dist/libadlmidi.light.slim.core.js', import.meta.url).href;

/**
 * Pre-configured AdlMidi for light slim profile.
 * 
 * @example
 * ```javascript
 * import { AdlMidi } from 'libadlmidi-js/light.slim';
 * 
 * const synth = new AdlMidi();
 * await synth.init();  // No paths needed!
 * synth.noteOn(0, 60, 100);
 * ```
 */
export class AdlMidi extends BaseAdlMidi {
    /**
     * Initialize the synthesizer with this profile's WASM.
     * 
     * @param {string} [processorUrl] - Override processor URL (optional)
     * @param {string} [wasmUrl] - Override WASM URL (optional)
     * @returns {Promise<void>}
     */
    async init(processorUrl, wasmUrl) {
        return super.init(
            processorUrl || PROCESSOR_URL,
            wasmUrl || WASM_URL
        );
    }
}

/**
 * Pre-configured AdlMidiCore for light slim profile.
 * 
 * @example
 * ```javascript
 * import { AdlMidiCore } from 'libadlmidi-js/light.slim/core';
 * 
 * const synth = await AdlMidiCore.create();  // No paths needed!
 * synth.init(44100);
 * synth.noteOn(0, 60, 100);
 * const samples = synth.generate(4096);
 * ```
 */
export class AdlMidiCore {
    /**
     * Create a new AdlMidiCore instance with this profile's WASM.
     * 
     * @param {{corePath?: string}} [options] - Options (corePath is pre-configured)
     * @returns {Promise<BaseAdlMidiCore>}
     */
    static async create(options = {}) {
        return BaseAdlMidiCore.create({
            ...options,
            corePath: options.corePath || CORE_PATH
        });
    }
}

// Re-export struct utilities for convenience
export { 
    encodeInstrument, 
    decodeInstrument, 
    defaultInstrument,
    encodeOperator,
    decodeOperator,
    defaultOperator 
} from '../utils/struct.js';
