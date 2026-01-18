/**
 * Bundler smoke test entry point
 * 
 * Tests that importing from libadlmidi-js profile exports works correctly
 * when bundled with Vite. The build should succeed and properly handle
 * import.meta.url for asset resolution.
 */

// Test profile import (zero-config pattern) - this is what real consumers do
import { AdlMidi, AdlMidiCore } from 'libadlmidi-js/nuked';

// Test struct utilities import
import { encodeInstrument, decodeInstrument, defaultInstrument } from 'libadlmidi-js/structs';

// Export everything to ensure tree-shaking doesn't remove
export { AdlMidi, AdlMidiCore };
export { encodeInstrument, decodeInstrument, defaultInstrument };

// Simple runtime validation function
export async function validateImports() {
    // Check classes exist
    if (typeof AdlMidi !== 'function') {
        throw new Error('AdlMidi is not a function');
    }
    if (typeof AdlMidiCore !== 'object' || typeof AdlMidiCore.create !== 'function') {
        throw new Error('AdlMidiCore.create is not a function');
    }

    // Check struct utilities
    const inst = defaultInstrument();
    if (!inst || inst.operators?.length !== 4) {
        throw new Error('defaultInstrument() failed');
    }

    const encoded = encodeInstrument(inst);
    if (!(encoded instanceof Uint8Array) || encoded.length !== 40) {
        throw new Error('encodeInstrument() failed');
    }

    const decoded = decodeInstrument(encoded);
    if (!decoded || decoded.operators?.length !== 4) {
        throw new Error('decodeInstrument() failed');
    }

    return { success: true };
}
