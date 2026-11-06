import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const tag = process.env.RELEASE_TAG;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/, 'Invalid release version');
assert.equal(tag, `v${version}`, 'Release tag must match package.json version');
assert.equal(lock.version, version, 'package-lock.json version must match package.json');
assert.equal(lock.packages[''].version, version, 'Lockfile root package version must match package.json');
const npmTag = version.includes('-') ? 'next' : 'latest';
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nnpm_tag=${npmTag}\n`);
}
console.log(`Release ${tag}; npm dist-tag: ${npmTag}`);
