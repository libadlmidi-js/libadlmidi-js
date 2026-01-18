/**
 * libadlmidi-js - Nuked OPL3 profile
 * 
 * Most accurate OPL3 emulation, slightly higher CPU usage.
 * 
 * @example
 * ```javascript
 * import { AdlMidi } from 'libadlmidi-js/nuked.js';
 * const synth = new AdlMidi();
 * await synth.init();
 * ```
 */
export * from './src/profiles/nuked.js';
