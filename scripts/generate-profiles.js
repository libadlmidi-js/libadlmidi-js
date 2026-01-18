/**
 * Profile wrapper generator for libADLMIDI-JS
 * 
 * Creates zero-config profile modules that export pre-configured
 * AdlMidi (WebAudio) and AdlMidiCore (low-level) classes.
 */

import fs from 'fs';
import path from 'path';

const PROFILES = ['nuked', 'dosbox', 'light', 'full'];
const VARIANTS = ['', '.slim'];

function generateProfileWrapper(profile, slim = false) {
    const suffix = slim ? '.slim' : '';
    const profileName = `${profile}${suffix}`;

    return `/**
 * Zero-config ${profile}${slim ? ' (slim)' : ''} profile for libADLMIDI-JS
 * 
 * Exports pre-configured AdlMidi and AdlMidiCore with this profile's WASM.
 * ${slim ? 'Slim builds require loading a WOPL bank at runtime.' : ''}
 * 
 * @module profiles/${profileName}
 */

import { AdlMidi as BaseAdlMidi } from '../libadlmidi.js';
import { AdlMidiCore as BaseAdlMidiCore } from '../core.js';

// Resolve paths relative to this module
const PROCESSOR_URL = new URL('../../dist/libadlmidi.${profile}${suffix}.processor.js', import.meta.url).href;
const WASM_URL = new URL('../../dist/libadlmidi.${profile}${suffix}.core.wasm', import.meta.url).href;
const CORE_PATH = new URL('../../dist/libadlmidi.${profile}${suffix}.core.js', import.meta.url).href;

/**
 * Pre-configured AdlMidi for ${profile}${slim ? ' slim' : ''} profile.
 * 
 * @example
 * \`\`\`javascript
 * import { AdlMidi } from 'libadlmidi-js/${profileName}';
 * 
 * const synth = new AdlMidi();
 * await synth.init();  // No paths needed!
 * synth.noteOn(0, 60, 100);
 * \`\`\`
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
 * Pre-configured AdlMidiCore for ${profile}${slim ? ' slim' : ''} profile.
 * 
 * @example
 * \`\`\`javascript
 * import { AdlMidiCore } from 'libadlmidi-js/${profileName}/core';
 * 
 * const synth = await AdlMidiCore.create();  // No paths needed!
 * synth.init(44100);
 * synth.noteOn(0, 60, 100);
 * const samples = synth.generate(4096);
 * \`\`\`
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
`;
}

// Generate all profile wrappers
for (const profile of PROFILES) {
    for (const variant of VARIANTS) {
        const slim = variant === '.slim';
        const filename = `${profile}${variant}.js`;
        const content = generateProfileWrapper(profile, slim);

        fs.writeFileSync(path.join('src/profiles', filename), content);
        console.log(`Generated src/profiles/${filename}`);
    }
}

console.log('\nDone! Generated', PROFILES.length * VARIANTS.length, 'profile wrappers.');
