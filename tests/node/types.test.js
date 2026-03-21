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
            throw new Error(`TypeScript compilation failed: ${error.stderr?.toString() || error.message}`, { cause: error });
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

    it('should export Emulator enum', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('Emulator');
        expect(content).toContain('NUKED');
        expect(content).toContain('DOSBOX');
        expect(content).toContain('ESFMu');
    });

    it('should export TrackOption enum', () => {
        const content = readFileSync(dtsPath, 'utf8');
        expect(content).toContain('TrackOption');
        expect(content).toContain('ON');
        expect(content).toContain('OFF');
        expect(content).toContain('SOLO');
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
            'loadBankData(arrayBuffer: ArrayBuffer',
            'setBank(bank: number',
            'getInstrument(bankId?:',
            'setInstrument(bankId:',
            'resetState(): void',
            'panic(): void',
            'reset(): void',
            'close(): void',
            'suspend(): Promise<void>',
            'resume(): Promise<void>',
            // Config getters
            'getDeepVibrato(): Promise<boolean>',
            'getDeepTremolo(): Promise<boolean>',
            'getNumFourOpChannelsObtained(): Promise<number>',
            // Soft panning
            'setSoftPanEnabled(enabled: boolean',
            // Bank management
            'reserveBanks(count: number',
            'removeBank(bankId:',
            'getBankId(bankId:',
            'loadEmbeddedBank(bankId:',
            // SysEx
            'systemExclusive(data:',
            // Debug
            'describeChannels():',
            // Sequencer
            'selectSongNum(num: number',
            'getSongsCount(): Promise<number>',
            'getTrackCount(): Promise<number>',
            'setTrackOptions(track: number',
            'setChannelEnabled(channel: number',
            'setLoopCount(count: number',
            'setLoopHooksOnly(enabled: boolean',
            'getLoopStartTime(): Promise<number>',
            'getLoopEndTime(): Promise<number>',
            // Metadata
            'getTrackTitleCount(): Promise<number>',
            'getTrackTitle(index: number',
            'getMarkerCount(): Promise<number>',
            // Error
            'getErrorInfo(): Promise<string>',
            // Volume
            'setVolumeRangeModel(model: number',
            'getVolumeRangeModel(): Promise<number>',
            // Vibrato/Tremolo
            'setDeepVibrato(enabled: boolean',
            'setDeepTremolo(enabled: boolean',
            // Looping
            'setLoopEnabled(enabled: boolean',
        ];

        for (const method of expectedMethods) {
            expect(content).toContain(method);
        }
    });
});
