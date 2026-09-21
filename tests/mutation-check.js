#!/usr/bin/env node
// Do these tests actually catch anything?
//
// A suite that passes is only evidence if it would have failed on broken code.
// This breaks the measurement math on purpose, one bug at a time, into a
// throwaway copy of index.html, and checks that the test which claims to guard
// that bug really does go red.
//
// A mutation that nothing catches is a hole in the suite, not a pass.
//
// Run with: npm run verify-tests
// index.html is never modified -- every mutation goes to a temp copy.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SOURCE = path.join(REPO, 'index.html');
const MUTANT = path.join(REPO, '_mutant.html'); // gitignored, deleted below

const MUTATIONS = [
  {
    name: 'drop cos(latitude) from the projection',
    find: 'x: (p.lng - lngRef) * Math.PI / 180 * R * Math.cos(latRef * Math.PI / 180),',
    replace: 'x: (p.lng - lngRef) * Math.PI / 180 * R,',
    caughtBy: 'longitude shrinks by cos',
  },
  {
    name: 'use a wrong Earth radius',
    find: 'const R = 6371000;\n    return pins.map(p => ({',
    replace: 'const R = 6771000;\n    return pins.map(p => ({',
    caughtBy: 'thousandth of a degree of latitude',
  },
  {
    name: 'sum overlapping cut-outs instead of unioning them (the 30 Aug bug)',
    find: '      const sign = subset.length % 2 ? 1 : -1;',
    replace: '      const sign = 1;',
    caughtBy: 'come off once, not twice',
  },
  {
    name: 'let a cut-out bigger than its zone go negative',
    find: 'return Math.max(0, zoneSqft(z) - cutRemovedSqft(z));',
    replace: 'return zoneSqft(z) - cutRemovedSqft(z);',
    caughtBy: 'floors at zero',
  },
  {
    name: 'subtract a whole cut-out instead of just its overlap',
    find: '.map(z => ({ zone: z, sqft: overlapSqm(zone.pins, z.pins) * 10.7639 }))',
    replace: '.map(z => ({ zone: z, sqft: calcAreaSqm(z.pins) * 10.7639 }))',
    caughtBy: 'still counts only the overlap',
  },
  {
    name: 'skip the reverse in ear clipping, breaking concave shapes',
    find: 'if (signedArea(pts) < 0) pts.reverse(); // ear clipping wants CCW',
    replace: '// mutated: winding not normalised',
    caughtBy: 'concave lawn clips cut-outs',
  },
  {
    name: 'count snow storage as cleared ground',
    find: ".filter(z => !(isSnow() && surfaceOf(z) === 'storage'))",
    replace: '.filter(() => true)',
    caughtBy: 'storage is excluded from the headline',
  },
];

const original = fs.readFileSync(SOURCE, 'utf8');

// Match the file's own line endings before looking for a mutation.
//
// index.html is checked out with CRLF on Windows, but the find strings above
// are written with bare newlines. Any find that spans more than one line then
// misses -- and the miss is reported as "the code it patches has moved", which
// reads like the mutation needs updating when nothing has moved at all. The
// Earth-radius guard sat unchecked behind exactly that message. It is the only
// multi-line find in the list, which is why it was the only one affected.
const EOL = original.includes('\r\n') ? '\r\n' : '\n';
const eol = (str) => str.split('\r\n').join('\n').split('\n').join(EOL);

let holes = 0;

console.log(`Checking ${MUTATIONS.length} deliberate bugs against the suite.\n`);

for (const m of MUTATIONS) {
  if (!original.includes(eol(m.find))) {
    console.log(`  ?  ${m.name}`);
    console.log(`     SKIPPED -- the code it patches has moved. Update this mutation.\n`);
    holes++;
    continue;
  }

  fs.writeFileSync(MUTANT, original.replace(eol(m.find), eol(m.replace)));

  // Run Playwright's CLI through node directly. Going via `npx` fails here:
  // Node on Windows refuses to spawn a .cmd without a shell (EINVAL), and the
  // failure is silent enough to look like every test passing.
  const run = spawnSync(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', '--reporter=json'],
    {
      cwd: REPO,
      env: { ...process.env, BOOTPRINT_APP: '_mutant.html' },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }
  );

  const failedTitles = [];
  try {
    // The JSON report can be preceded by warnings, so start at the first brace.
    const raw = run.stdout || '';
    const report = JSON.parse(raw.slice(raw.indexOf('{')));
    const walk = (suites) => (suites || []).forEach((s) => {
      (s.specs || []).forEach((spec) => { if (!spec.ok) failedTitles.push(spec.title); });
      walk(s.suites);
    });
    walk(report.suites);
  } catch {
    console.log(`  ?  ${m.name}`);
    console.log(`     could not read the test report -- treating as a hole.\n`);
    holes++;
    continue;
  }

  const caught = failedTitles.some((t) => t.includes(m.caughtBy));
  if (caught) {
    console.log(`  CAUGHT  ${m.name}`);
    console.log(`          by "${failedTitles.find((t) => t.includes(m.caughtBy))}"`);
    if (failedTitles.length > 1) {
      console.log(`          (${failedTitles.length} tests went red in total)`);
    }
  } else {
    holes++;
    console.log(`  MISSED  ${m.name}`);
    console.log(`          nothing matching "${m.caughtBy}" failed.`);
    console.log(`          ${failedTitles.length} other test(s) failed: ${failedTitles.slice(0, 3).join(', ') || 'none'}`);
  }
  console.log('');
}

fs.rmSync(MUTANT, { force: true });

if (holes === 0) {
  console.log(`All ${MUTATIONS.length} bugs were caught. The suite has teeth.`);
  process.exit(0);
}
console.log(`${holes} of ${MUTATIONS.length} bugs slipped through. That is a hole in the suite.`);
process.exit(1);
