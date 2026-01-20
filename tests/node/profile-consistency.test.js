/**
 * Validates that package.json exports match the profiles defined in the build scripts
 *
 * scripts/build-docker-inner.sh is the single source of truth for profile definitions.
 * This test ensures package.json stays in sync.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// Non-profile exports that should be excluded from consistency checks
const NON_PROFILE_EXPORTS = new Set(['.', './core', './structs', './dist/*']);

/**
 * Extract profile names from scripts/build-docker-inner.sh EMULATOR_PROFILES array
 */
function getProfilesFromBuildScript() {
    const buildScript = fs.readFileSync('scripts/build-docker-inner.sh', 'utf-8');

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
 * Extract base profile names from package.json exports (stripping /slim suffix)
 */
function getBaseProfilesFromPackageJson() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const exports = pkg.exports || {};

    // Get unique base profiles (./nuked and ./nuked/slim both count as "nuked")
    const baseProfiles = new Set();
    for (const key of Object.keys(exports)) {
        if (NON_PROFILE_EXPORTS.has(key)) continue;
        // Extract base profile: ./nuked -> nuked, ./nuked/slim -> nuked
        const match = key.match(/^\.\/([a-z]+)/);
        if (match) {
            baseProfiles.add(match[1]);
        }
    }

    return [...baseProfiles].sort();
}

describe('Profile Consistency', () => {
    it('package.json exports should cover all build.sh profiles', () => {
        const buildProfiles = getProfilesFromBuildScript();
        const pkgProfiles = getBaseProfilesFromPackageJson();

        expect(buildProfiles.length).toBeGreaterThan(0);
        expect(pkgProfiles).toEqual(buildProfiles);
    });

    it('package.json profile exports should point to wrapper modules', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
        const exports = pkg.exports || {};
        const buildProfiles = getProfilesFromBuildScript();

        for (const profile of buildProfiles) {
            // Check main profile
            const mainExport = exports[`./${profile}`];
            expect(mainExport).toBeDefined();
            expect(mainExport.import).toBe(`./src/profiles/${profile}.js`);

            // Check slim variant
            const slimExport = exports[`./${profile}/slim`];
            expect(slimExport).toBeDefined();
            expect(slimExport.import).toBe(`./src/profiles/${profile}.slim.js`);
        }
    });

    it('package.json should have module exports with correct structure', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
        const exports = pkg.exports || {};

        // Check ./core export
        expect(exports['./core']).toBeDefined();
        expect(exports['./core'].import).toBe('./src/core.js');
        expect(exports['./core'].types).toBe('./dist/core.d.ts');

        // Check ./structs export
        expect(exports['./structs']).toBeDefined();
        expect(exports['./structs'].import).toBe('./src/utils/struct.js');

        // Check ./dist/* wildcard for power users
        expect(exports['./dist/*']).toBe('./dist/*');
    });
});

