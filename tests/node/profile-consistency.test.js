/**
 * Validates that package.json exports match the profiles defined in build.sh
 * 
 * build.sh is the single source of truth for profile definitions.
 * This test ensures package.json stays in sync.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * Extract profile names from build.sh EMULATOR_PROFILES array
 */
function getProfilesFromBuildScript() {
    const buildScript = fs.readFileSync('build.sh', 'utf-8');

    // Match lines like: "nuked|-DUSE_..."
    const profilePattern = /^\s*"([a-z]+)\|/gm;
    const profiles = [];
    let match;

    while ((match = profilePattern.exec(buildScript)) !== null) {
        profiles.push(match[1]);
    }

    return profiles.sort();
}

/**
 * Extract profile names from package.json exports
 */
function getProfilesFromPackageJson() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const exports = pkg.exports || {};

    // Filter to profile exports (start with ./ but not just ".")
    const profiles = Object.keys(exports)
        .filter(key => key.startsWith('./') && key !== '.')
        .map(key => key.slice(2)) // Remove "./" prefix
        .sort();

    return profiles;
}

describe('Profile Consistency', () => {
    it('package.json exports should match build.sh profiles', () => {
        const buildProfiles = getProfilesFromBuildScript();
        const pkgProfiles = getProfilesFromPackageJson();

        expect(buildProfiles.length).toBeGreaterThan(0);
        expect(pkgProfiles).toEqual(buildProfiles);
    });

    it('package.json exports should have correct file paths', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
        const exports = pkg.exports || {};

        for (const [key, value] of Object.entries(exports)) {
            if (key === '.') continue; // Skip main export

            const profile = key.slice(2); // Remove "./" prefix

            expect(value.processor).toBe(`./dist/libadlmidi.${profile}.processor.js`);
            expect(value.wasm).toBe(`./dist/libadlmidi.${profile}.core.wasm`);
        }
    });
});
