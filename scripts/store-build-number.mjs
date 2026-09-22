import assert from 'node:assert/strict';

// Explicit per upload: never silently reuse a previously uploaded build.
export function storeBuildArguments(args) {
  const flags = args.filter(arg => arg.startsWith('--build-number='));
  assert.equal(flags.length, 1, 'Pass exactly one --build-number=<new Apple build number>.');
  const buildNumber = flags[0].slice('--build-number='.length);
  assert(/^[1-9][0-9]{0,3}$/.test(buildNumber), 'Build number must be an integer from 1 to 9999.');
  assert(Number(buildNumber) > 4, 'Builds through 4 were already uploaded; select a newer unused build.');
  return { buildNumber, args: args.filter(arg => arg !== flags[0]) };
}
