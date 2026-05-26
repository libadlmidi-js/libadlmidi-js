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

// Emulator.NUKED_FAST value. Hardcoded to avoid importing constants.js at
// build time. Must stay in sync with src/utils/constants.js.
const NUKED_FAST = 1;

// Profiles that bundle the Nuked Fast variant get it as their runtime default.
// dosbox does not include Nuked at all, so it keeps the libADLMIDI default
// (whichever DosBox enum value is wired up by the compiled-in set).
const PROFILE_DEFAULT_EMULATOR = {
    nuked: NUKED_FAST,
    light: NUKED_FAST,
    full: NUKED_FAST,
    dosbox: undefined,
};

function generateProfileWrapper(profile, slim = false) {
    const suffix = slim ? '.slim' : '';
    const profileName = `${profile}${suffix}`;
    const defaultEmulator = PROFILE_DEFAULT_EMULATOR[profile];
    const defaultsLiteral = defaultEmulator !== undefined
        ? `{ emulator: ${defaultEmulator} }`
        : '{}';
    const coreDefaultArg = defaultEmulator !== undefined
        ? `, defaultEmulator: options.defaultEmulator !== undefined ? options.defaultEmulator : ${defaultEmulator}`
        : '';

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

// Default synth settings injected at init. NUKED_FAST is preferred when the
// profile bundles it (bit-exact vs Nuked 1.8, roughly 1.5x faster).
const DEFAULT_SETTINGS = ${defaultsLiteral};

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
     * @param {object} [defaultSettings] - Override profile's default synth settings
     * @returns {Promise<void>}
     */
    async init(processorUrl, wasmUrl, defaultSettings) {
        return super.init(
            processorUrl || PROCESSOR_URL,
            wasmUrl || WASM_URL,
            defaultSettings || DEFAULT_SETTINGS
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
     * @param {{corePath?: string, defaultEmulator?: number, wasmBinary?: ArrayBuffer}} [options]
     *   Override profile defaults. corePath and defaultEmulator are pre-configured.
     * @returns {Promise<BaseAdlMidiCore>}
     */
    static async create(options = {}) {
        return BaseAdlMidiCore.create({
            ...options,
            corePath: options.corePath || CORE_PATH${coreDefaultArg}
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

// Re-export enums
export { Emulator, TrackOption } from '../utils/constants.js';
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
