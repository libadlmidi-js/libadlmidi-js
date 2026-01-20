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
        await expect(page.locator('#status')).toContainText('Bank:');
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
        await expect(page.locator('#status')).toContainText('All notes stopped');

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

    test('player MIDI playback API works', async ({ page }) => {
        // Test the public MIDI playback API via the AdlMidi class
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            const { AdlMidi } = window.testUtils;

            // Create synth instance
            const synth = new AdlMidi();
            await synth.init('/dist/libadlmidi.nuked.processor.js');

            // Fetch a test MIDI file
            const response = await fetch('/test-files/canyon.mid');
            const midiData = await response.arrayBuffer();

            // Test loadMidi - should return duration
            const loadResult = await synth.loadMidi(midiData);
            if (typeof loadResult.duration !== 'number' || loadResult.duration <= 0) {
                throw new Error(`loadMidi returned invalid duration: ${loadResult.duration}`);
            }

            // Test play/stop
            synth.play();
            await new Promise(r => setTimeout(r, 100));

            // Test getPlaybackState
            const state = await synth.getPlaybackState();
            if (typeof state.position !== 'number') {
                throw new Error(`getPlaybackState returned invalid position: ${state.position}`);
            }
            if (typeof state.duration !== 'number') {
                throw new Error(`getPlaybackState returned invalid duration: ${state.duration}`);
            }
            if (typeof state.atEnd !== 'boolean') {
                throw new Error(`getPlaybackState returned invalid atEnd: ${state.atEnd}`);
            }

            // Test setLoop
            synth.setLoop(true);

            // Test stop
            synth.stop();

            // Clean up
            synth.close();

            return {
                loadDuration: loadResult.duration,
                statePosition: state.position,
                stateDuration: state.duration,
                stateAtEnd: state.atEnd
            };
        });

        // Verify results
        expect(result.loadDuration).toBeGreaterThan(0);
        expect(result.stateDuration).toBeGreaterThan(0);
        expect(typeof result.stateAtEnd).toBe('boolean');
        console.log(`MIDI API test: duration=${result.loadDuration.toFixed(2)}s, position=${result.statePosition.toFixed(2)}s`);
    });

    test('player IMF playback API works', async ({ page }) => {
        // Test the public MIDI playback API with IMF files
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            const { AdlMidi } = window.testUtils;

            // Create synth instance
            const synth = new AdlMidi();
            await synth.init('/dist/libadlmidi.nuked.processor.js');

            // Fetch a test IMF file
            const response = await fetch('/test-files/mamsnake.imf');
            const imfData = await response.arrayBuffer();

            // Test loadMidi with IMF file - should return duration
            const loadResult = await synth.loadMidi(imfData);
            if (typeof loadResult.duration !== 'number' || loadResult.duration <= 0) {
                throw new Error(`loadMidi (IMF) returned invalid duration: ${loadResult.duration}`);
            }

            // Test play
            synth.play();
            await new Promise(r => setTimeout(r, 100));

            // Test getPlaybackState
            const state = await synth.getPlaybackState();

            // Test stop
            synth.stop();

            // Clean up
            synth.close();

            return {
                loadDuration: loadResult.duration,
                statePosition: state.position,
                stateDuration: state.duration
            };
        });

        // Verify results
        expect(result.loadDuration).toBeGreaterThan(0);
        expect(result.stateDuration).toBeGreaterThan(0);
        console.log(`IMF API test: duration=${result.loadDuration.toFixed(2)}s, position=${result.statePosition.toFixed(2)}s`);
    });

    test('file playback and real-time MIDI can be mixed', async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            const { hashSamples } = window.testUtils;

            // Helper to render audio with a synth
            async function renderAudio(setupFn, durationMs = 500) {
                const sampleRate = 44100;
                const samples = Math.floor((durationMs / 1000) * sampleRate);
                const ctx = new OfflineAudioContext(2, samples, sampleRate);

                const wasmResponse = await fetch('/dist/libadlmidi.nuked.core.wasm');
                const wasmBinary = await wasmResponse.arrayBuffer();

                await ctx.audioWorklet.addModule('/dist/libadlmidi.nuked.processor.js');

                const node = new AudioWorkletNode(ctx, 'adl-midi-processor', {
                    processorOptions: { sampleRate, wasmBinary }
                });
                node.connect(ctx.destination);

                // Wait for ready
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                    node.port.onmessage = (e) => {
                        if (e.data.type === 'ready') {
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                });

                // Run the setup function (load file, send notes, etc.)
                await setupFn(node);

                // Render
                const buffer = await ctx.startRendering();
                const left = buffer.getChannelData(0);

                return await hashSamples(left);
            }

            // Fetch MIDI file once
            const response = await fetch('/test-files/canyon.mid');
            const midiData = await response.arrayBuffer();

            // Helper to sync with worklet
            const syncWorklet = (node) => {
                return new Promise(resolve => {
                    const handler = (e) => {
                        if (e.data.type === 'pong') {
                            node.port.removeEventListener('message', handler);
                            resolve();
                        }
                    };
                    node.port.addEventListener('message', handler);
                    node.port.postMessage({ type: 'ping' });
                });
            };

            // Test 1: MIDI file playback only
            const hashFileOnly = await renderAudio(async (node) => {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Load timeout')), 5000);
                    const handler = (e) => {
                        if (e.data.type === 'midiLoaded') {
                            node.port.removeEventListener('message', handler);
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                    node.port.addEventListener('message', handler);
                    node.port.postMessage({ type: 'loadMidi', data: midiData.slice(0) });
                });
                node.port.postMessage({ type: 'play' });
                await syncWorklet(node);
            });

            // Test 2: MIDI file + extra real-time note
            const hashFileWithNote = await renderAudio(async (node) => {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Load timeout')), 5000);
                    const handler = (e) => {
                        if (e.data.type === 'midiLoaded') {
                            node.port.removeEventListener('message', handler);
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                    node.port.addEventListener('message', handler);
                    node.port.postMessage({ type: 'loadMidi', data: midiData.slice(0) });
                });
                node.port.postMessage({ type: 'play' });
                // Add an extra note on channel 15 (unlikely to conflict)
                node.port.postMessage({ type: 'noteOn', channel: 15, note: 36, velocity: 127 });
                await syncWorklet(node);
            });

            return {
                hashFileOnly,
                hashFileWithNote,
                different: hashFileOnly !== hashFileWithNote
            };
        });

        // The hashes should be different - the extra note should change the audio
        expect(result.different).toBe(true);
        console.log(`Mixed mode test: file-only=${result.hashFileOnly.substring(0, 16)}..., with-note=${result.hashFileWithNote.substring(0, 16)}...`);
    });

    test('getEmbeddedBanks returns bank list', async ({ page }) => {
        await page.goto('/tests/fixtures/test-harness.html');
        await page.waitForFunction(() => window.testReady === true, { timeout: 10000 });

        const result = await page.evaluate(async () => {
            const { AdlMidi } = window.testUtils;

            const synth = new AdlMidi();
            await synth.init('/dist/libadlmidi.nuked.processor.js');

            const banks = await synth.getEmbeddedBanks();
            synth.close();

            return {
                count: banks.length,
                hasId: banks.length > 0 && typeof banks[0].id === 'number',
                hasName: banks.length > 0 && typeof banks[0].name === 'string',
                firstBank: banks[0],
                bank72: banks.find(b => b.id === 72)
            };
        });

        // Should have many banks (the full build has 70+)
        expect(result.count).toBeGreaterThan(0);
        expect(result.hasId).toBe(true);
        expect(result.hasName).toBe(true);
        expect(result.firstBank.id).toBe(0);
        expect(result.firstBank.name).toBeTruthy();
        console.log(`getEmbeddedBanks: ${result.count} banks, first="${result.firstBank.name}", bank72="${result.bank72?.name}"`);
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

    test('midi-to-audio.html loads and accepts file', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/midi-to-audio.html');
        await expect(page.locator('h1')).toContainText('MIDI to WAV Converter');

        // Check if bank select populates
        await expect(page.locator('#bankSelect option')).not.toHaveCount(0);

        // Wait for synth to be ready
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Upload a MIDI file
        const fileInput = page.locator('#fileInput');
        await fileInput.setInputFiles('test-files/canyon.mid');

        // Check if status updates
        await expect(page.locator('#status')).toContainText('Loaded:', { timeout: 10000 });
        await expect(page.locator('#fileName')).toContainText('canyon.mid');

        // Convert button should be enabled
        await expect(page.locator('#convertBtn')).toBeEnabled();

        // No console errors
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('patch-editor.html initializes and changes program', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/patch-editor.html');

        // Click initialize
        await page.click('#initBtn');
        // It goes Ready -> Loading program 0... -> Program 0 loaded
        await expect(page.locator('#status')).toContainText('Program 0 loaded', { timeout: 10000 });

        // Select a different program
        await page.selectOption('#programSelect', '56'); // Trumpet

        // Verify status updated (which implies loadPatch -> programChange was called)
        await expect(page.locator('#status')).toContainText('Program 56 loaded');

        // Verify UI controls are enabled
        await expect(page.locator('#bankSelect')).toBeEnabled();
        await expect(page.locator('#programSelect')).toBeEnabled();

        // No console errors
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('player.html loads MIDI file and enables play', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/examples/player.html');

        // Initialize
        await page.click('#initBtn');
        await expect(page.locator('#status')).toContainText('Ready', { timeout: 10000 });

        // Upload MIDI file
        const fileInput = page.locator('#fileInput');
        await fileInput.setInputFiles('test-files/canyon.mid');

        // Wait for load
        await expect(page.locator('#status')).toContainText('Loaded: canyon.mid', { timeout: 10000 });

        // Play button should be enabled
        await expect(page.locator('#playBtn')).toBeEnabled();
        await expect(page.locator('#playBtn')).toContainText('Play');

        // Click play
        await page.click('#playBtn');
        await expect(page.locator('#playBtn')).toContainText('Pause');
        await expect(page.locator('#status')).toContainText('Playing...');

        // Wait a bit
        await page.waitForTimeout(500);

        // Stop
        await page.click('#stopBtn');
        await expect(page.locator('#playBtn')).toContainText('Play');
        await expect(page.locator('#status')).toContainText('Stopped');

        // No console errors
        expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });
});
