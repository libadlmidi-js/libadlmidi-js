/**
 * TypeScript type validation test
 * 
 * Verifies that the .d.ts file is valid TypeScript and exports
 * all expected types. The types are AUTO-GENERATED from JSDoc
 * in src/libadlmidi.js via `tsc --declaration`.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('TypeScript Definitions', () => {
    const dtsPath = join(process.cwd(), 'dist', 'libadlmidi.d.ts');

    it('should compile without errors', () => {
        // Run tsc and check exit code
        try {
            execSync('npx tsc', {
                cwd: process.cwd(),
                stdio: 'pipe'
            });
        } catch (error) {
            // If tsc fails, show the error
            throw new Error(`TypeScript compilation failed: ${error.stderr?.toString() || error.message}`);
        }
    });

    it('should export AdlMidi class', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export class AdlMidi');
    });

    it('should export Operator type', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export type Operator');

        // Check key operator properties with proper format
        expect(content).toContain('attack: number');
        expect(content).toContain('decay: number');
        expect(content).toContain('sustain: number');
        expect(content).toContain('release: number');
        expect(content).toContain('waveform: number');
    });

    it('should export Instrument type', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export type Instrument');

        // Check key instrument properties
        expect(content).toContain('is4op: boolean');
        expect(content).toContain('feedback1: number');
        expect(content).toContain('connection1: number');
        expect(content).toContain('operators: [Operator, Operator, Operator, Operator]');
    });

    it('should export BankId type', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export type BankId');
        expect(content).toContain('percussive: boolean');
        expect(content).toContain('msb: number');
        expect(content).toContain('lsb: number');
    });

    it('should export ConfigureSettings type', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('export type ConfigureSettings');
    });

    it('should have all AdlMidi methods typed', () => {
        const content = readFileSync(dtsPath, 'utf8');

        // Check method signatures in the generated .d.ts
        const expectedMethods = [
            'init(processorUrl: string',
            'noteOn(channel: number',
            'noteOff(channel: number',
            'pitchBend(channel: number',
            'controlChange(channel: number',
            'programChange(channel: number',
            'configure(settings: ConfigureSettings',
            'loadBank(arrayBuffer: ArrayBuffer',
            'setBank(bank: number',
            'getInstrument(bankId?:',
            'setInstrument(bankId:',
            'resetState(): void',
            'panic(): void',
            'reset(): void',
            'close(): void',
            'suspend(): Promise<void>',
            'resume(): Promise<void>',
        ];

        for (const method of expectedMethods) {
            expect(content).toContain(method);
        }
    });
});
