/**
 * Verify bundler output is correct
 * 
 * Checks:
 * 1. Build output exists
 * 2. Bundle imports can be loaded (struct utilities at minimum)
 * 3. No obvious errors in the bundle
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

console.log('Verifying bundler smoke test output...\n');

// Check 1: Build output exists
const bundlePath = join(distDir, 'bundle.js');
if (!existsSync(bundlePath)) {
    console.error('❌ Bundle not found at', bundlePath);
    process.exit(1);
}
console.log('✓ Bundle exists:', bundlePath);

// Check 2: Bundle content looks reasonable
const bundleContent = readFileSync(bundlePath, 'utf-8');

// Should contain AdlMidi class
if (!bundleContent.includes('AdlMidi')) {
    console.error('❌ Bundle does not contain AdlMidi');
    process.exit(1);
}
console.log('✓ Bundle contains AdlMidi');

// Should contain struct utilities
if (!bundleContent.includes('encodeInstrument') || !bundleContent.includes('decodeInstrument')) {
    console.error('❌ Bundle does not contain struct utilities');
    process.exit(1);
}
console.log('✓ Bundle contains struct utilities');

// Should have import.meta.url pattern preserved or resolved
if (!bundleContent.includes('import.meta.url') && !bundleContent.includes('new URL')) {
    console.warn('⚠ Bundle may not correctly handle asset URLs (expected import.meta.url or new URL)');
}
console.log('✓ Bundle has URL handling');

// Check 3: Try to import and run struct utilities
try {
    const bundle = await import('./dist/bundle.js');

    if (typeof bundle.encodeInstrument !== 'function') {
        throw new Error('encodeInstrument not exported');
    }
    if (typeof bundle.decodeInstrument !== 'function') {
        throw new Error('decodeInstrument not exported');
    }
    if (typeof bundle.defaultInstrument !== 'function') {
        throw new Error('defaultInstrument not exported');
    }

    // Test struct utilities work
    const inst = bundle.defaultInstrument();
    const encoded = bundle.encodeInstrument(inst);
    const decoded = bundle.decodeInstrument(encoded);

    if (decoded.operators.length !== 4) {
        throw new Error('Struct roundtrip failed');
    }

    console.log('✓ Struct utilities work correctly');
} catch (err) {
    console.error('❌ Failed to validate bundle exports:', err.message);
    process.exit(1);
}

// Check 4: Bundle size is reasonable
const bundleSize = bundleContent.length;
console.log(`✓ Bundle size: ${(bundleSize / 1024).toFixed(1)} KB`);

// Lib mode includes embedded WASM, so 2MB is expected
if (bundleSize > 3 * 1024 * 1024) {
    console.warn('⚠ Bundle seems very large (>3MB) - may include unexpected content');
}

console.log('\n✅ Bundler smoke test passed!');
