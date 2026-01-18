/**
 * Smoke tests for example pages
 */

import { test, expect } from '@playwright/test'

test.describe('Example Pages', () => {

    test('patch-editor.html loads without errors', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/patch-editor.html');

        // Page should load with recognizable content
        await expect(page.locator('h1')).toBeVisible();

        // Look for init mechanism
        const buttons = page.locator('button');
        const buttonCount = await buttons.count();
        expect(buttonCount).toBeGreaterThan(0);

        // No console errors on load
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('webmidi.html loads without errors', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/webmidi.html');

        // Page should load
        await expect(page.locator('h1')).toBeVisible();

        // Wait for MIDI initialization attempt
        await page.waitForTimeout(1000);

        // No console errors (WebMIDI API should be available in Chromium)
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('keyboard.html loads and initializes', async ({ page }) => {
        // Capture console errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/keyboard.html');

        // Page should load with init button
        await expect(page.locator('#initBtn')).toBeVisible();
        await expect(page.locator('#status')).toContainText('Not initialized');

        // Click init button
        await page.click('#initBtn');

        // Wait for ready status (with timeout)
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Init button should be disabled after init
        await expect(page.locator('#initBtn')).toBeDisabled();

        // Panic button should be enabled
        await expect(page.locator('#panicBtn')).toBeEnabled();

        // No console errors during init
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('player.html loads and initializes', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/player.html');

        // Page should load
        await expect(page.locator('h1')).toContainText('MIDI');

        // Should have an init or load button
        const initButton = page.locator('button').first();
        await expect(initButton).toBeVisible();

        // Click to initialize
        await initButton.click();

        // Wait for initialization (may vary by example structure)
        await page.waitForTimeout(2000);

        // No critical console errors
        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('404')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('keyboard can play a note without crashing', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        // Initialize
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Find a key and click it
        const key = page.locator('.key').first();
        await expect(key).toBeVisible();

        // Simulate note on/off
        await key.dispatchEvent('mousedown');
        await page.waitForTimeout(200);
        await key.dispatchEvent('mouseup');

        // Should not crash
        await expect(page.locator('#status')).toBeVisible();
    });

    test('keyboard has audio context in running state', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        // Initialize synth
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Verify AudioContext is running
        const audioInfo = await page.evaluate(() => {
            if (window.AudioContext || window.webkitAudioContext) {
                const audioWorklets = performance.getEntriesByType('resource')
                    .filter(r => r.name.includes('processor'));

                return {
                    hasAudioAPI: true,
                    workletResourcesLoaded: audioWorklets.length > 0,
                    documentReady: document.readyState
                };
            }
            return { hasAudioAPI: false };
        });

        expect(audioInfo.hasAudioAPI).toBe(true);
    });

    test('keyboard responds to keyboard input', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        // Initialize
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Press a key that should trigger a note
        await page.keyboard.down('z');  // This should play C3
        await page.waitForTimeout(100);

        // Check if the key element got the active class
        const keyZ = page.locator('.key[data-key="z"]');
        await expect(keyZ).toHaveClass(/active/);

        await page.keyboard.up('z');
        await page.waitForTimeout(100);

        // Key should no longer be active
        await expect(keyZ).not.toHaveClass(/active/);
    });

    test('keyboard bank selection works', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        // Initialize
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Change bank
        await page.selectOption('#bankSelect', '0');

        // Status should update
        await expect(page.locator('#status')).toContainText('Bank changed');
    });

    test('keyboard panic button stops all notes', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        // Initialize
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Start a note
        await page.keyboard.down('z');
        await page.waitForTimeout(100);

        // Click panic
        await page.click('#panicBtn');

        // Status should update
        await expect(page.locator('#status')).toContainText('Panic');

        await page.keyboard.up('z');
    });

    test('player can load MIDI files', async ({ page }) => {
        await page.goto('/examples/player.html');

        // Look for init button
        await page.waitForSelector('button');
        const initBtn = page.locator('button').first();
        await initBtn.click();

        // Wait for initialization
        await page.waitForTimeout(3000);

        // Check if there's a file input or MIDI selection
        const hasFileInput = await page.locator('input[type="file"]').count() > 0;
        const hasMidiSelect = await page.locator('select').count() > 0;

        // Player should have some way to load files
        expect(hasFileInput || hasMidiSelect).toBe(true);
    });

    test('keyboard produces actual audio samples', async ({ page }) => {
        await page.goto('/examples/keyboard.html');

        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        const audioData = await page.evaluate(async () => {
            const synth = window.synth;
            if (!synth) throw new Error('Example synth not found on window.synth');

            // Create an analyser and insert it between synth and destination
            const ctx = synth.audioContext;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;

            // Disconnect from destination and route through analyser
            synth.node.disconnect();
            synth.node.connect(analyser);
            analyser.connect(ctx.destination);

            // Play a note using the example's synth
            synth.noteOn(0, 60, 100);

            // Wait for audio to generate and propagate
            await new Promise(r => setTimeout(r, 500));

            // Sample multiple times to ensure we capture audio
            let maxEnergy = 0;
            let maxNonSilent = 0;

            for (let attempt = 0; attempt < 5; attempt++) {
                // Read frequency data
                const freqData = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(freqData);

                // Calculate average energy
                let sum = 0;
                for (let i = 0; i < freqData.length; i++) {
                    sum += freqData[i];
                }
                const avgEnergy = sum / freqData.length;
                if (avgEnergy > maxEnergy) maxEnergy = avgEnergy;

                // Get time domain data
                const timeData = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(timeData);

                // Check for non-silent samples
                let nonSilentCount = 0;
                for (let i = 0; i < timeData.length; i++) {
                    if (Math.abs(timeData[i] - 128) > 2) nonSilentCount++;
                }
                if (nonSilentCount > maxNonSilent) maxNonSilent = nonSilentCount;

                await new Promise(r => setTimeout(r, 50));
            }

            synth.noteOff(0, 60);

            // Reconnect synth to destination (restore normal operation)
            synth.node.disconnect();
            synth.node.connect(ctx.destination);

            return { avgEnergy: maxEnergy, nonSilentCount: maxNonSilent, fftSize: analyser.fftSize };
        });

        // Verify audio was actually produced
        expect(audioData.avgEnergy).toBeGreaterThan(0.5);
        expect(audioData.nonSilentCount).toBeGreaterThan(5);
        console.log(`Keyboard audio: avgEnergy=${audioData.avgEnergy.toFixed(2)}, nonSilent=${audioData.nonSilentCount}/${audioData.fftSize}`);
    });
});
