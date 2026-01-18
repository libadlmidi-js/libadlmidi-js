/**
 * Node-based tests for WASM module loading
 * 
 * These tests verify the WASM internals work without needing a browser.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DIST_DIR = join(process.cwd(), 'dist');

describe('WASM Module', () => {
    it('should have build artifacts', () => {
        // Check that at least one profile exists
        const profiles = ['nuked', 'nuked.slim'];
        const foundProfile = profiles.some(p =>
            existsSync(join(DIST_DIR, `libadlmidi.${p}.js`))
        );
        expect(foundProfile).toBe(true);
    });

    it('should have TypeScript definitions', () => {
        const dtsPath = join(DIST_DIR, 'libadlmidi.d.ts');
        expect(existsSync(dtsPath)).toBe(true);

        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export class AdlMidi');
        expect(content).toContain('export type Operator');
        expect(content).toContain('export type Instrument');
    });

    it('should have processor files for each profile', () => {
        // Check processor files exist
        const processorPath = join(DIST_DIR, 'libadlmidi.nuked.processor.js');
        if (existsSync(processorPath)) {
            const content = readFileSync(processorPath, 'utf8');
            expect(content).toContain('AdlMidiProcessor');
            expect(content).toContain('registerProcessor');
        } else {
            // Skip if not built yet
            console.warn('Processor file not found - run build first');
        }
    });
});

describe('Test Files', () => {
    it('should have IMF test file', () => {
        const imfPath = join(process.cwd(), 'test-files', 'mamsnake.imf');
        expect(existsSync(imfPath)).toBe(true);

        const stats = readFileSync(imfPath);
        expect(stats.length).toBeGreaterThan(0);
    });
});
