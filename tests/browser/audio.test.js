/**
 * Browser-based audio output tests with golden master vectors
 * 
 * Uses Playwright to run audio tests in a real browser with OfflineAudioContext.
 * Tests verify deterministic output by comparing SHA-256 hashes against known-good values.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(__dirname, '..', 'fixtures', 'test-vectors.json');

// Load test vectors
let testVectors;
try {
    testVectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));
} catch {
    console.warn('Could not load test-vectors.json, running without vector validation');
    testVectors = { browser: {} };
}

test.describe('Audio Output', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });
    });

    test('should produce non-silent output', async ({ page }) => {
        const result = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        expect(result.rms).toBeGreaterThan(0.001);
        console.log(`Audio RMS: ${result.rms}, Hash: ${result.hash.substring(0, 16)}...`);
    });

    test('should produce deterministic output', async ({ page }) => {
        const result1 = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        await page.reload();
        await page.waitForFunction(() => window.testReady === true);

        const result2 = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        expect(result1.hash).toBe(result2.hash);
    });

    test('different notes should produce different output', async ({ page }) => {
        const resultC = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 300,
                note: 60,
                bank: 72
            });
        });

        await page.reload();
        await page.waitForFunction(() => window.testReady === true);

        const resultE = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 300,
                note: 64,
                bank: 72
            });
        });

        expect(resultC.hash).not.toBe(resultE.hash);
        expect(resultC.rms).toBeGreaterThan(0.001);
        expect(resultE.rms).toBeGreaterThan(0.001);
    });

    test('different banks should produce different output', async ({ page }) => {
        const result72 = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 300,
                note: 60,
                bank: 72
            });
        });

        await page.reload();
        await page.waitForFunction(() => window.testReady === true);

        const result58 = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 300,
                note: 60,
                bank: 58
            });
        });

        expect(result72.hash).not.toBe(result58.hash);
    });
});

test.describe('IMF Playback', () => {
    test('should play IMF file and match known hash', async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            return await window.testUtils.playIMF('/test-files/mamsnake.imf', 3000);
        });

        expect(result.rms).toBeGreaterThan(0.001);

        // Log full hash for vector capture
        console.log(`IMF mamsnake.imf hash: ${result.hash}`);

        // Check against known vector if available
        const vector = testVectors.browser?.imf_mamsnake_3s;
        if (vector?.hash) {
            expect(result.hash).toBe(vector.hash);
        }
    });
});

test.describe('MIDI Playback', () => {
    test('should play MIDI file and match known hash', async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            return await window.testUtils.playMIDI('/test-files/canyon.mid', 3000);
        });

        expect(result.rms).toBeGreaterThan(0.001);

        // Log full hash for vector capture
        console.log(`MIDI canyon.mid hash: ${result.hash}`);

        // Check against known vector if available
        const vector = testVectors.browser?.midi_canyon_3s;
        if (vector?.hash) {
            expect(result.hash).toBe(vector.hash);
        }
    });
});

test.describe('Split Build Mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });
    });

    test('should work with pre-fetched WASM binary', async ({ page }) => {
        const result = await page.evaluate(async () => {
            return await window.testUtils.generateAudioSplitBuild({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        expect(result.rms).toBeGreaterThan(0.001);
        console.log(`Split build Audio RMS: ${result.rms}, Hash: ${result.hash.substring(0, 16)}...`);
    });

    test('should produce identical output to bundled mode', async ({ page }) => {
        // Generate with bundled mode
        const bundledResult = await page.evaluate(async () => {
            return await window.testUtils.generateAudio({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        await page.reload();
        await page.waitForFunction(() => window.testReady === true);

        // Generate with split build mode
        const splitResult = await page.evaluate(async () => {
            return await window.testUtils.generateAudioSplitBuild({
                durationMs: 500,
                note: 60,
                bank: 72
            });
        });

        // Both modes should produce identical audio
        expect(splitResult.hash).toBe(bundledResult.hash);
        expect(splitResult.rms).toBeGreaterThan(0.001);
    });
});
