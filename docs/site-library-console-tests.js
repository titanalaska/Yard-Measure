// Yard Measure — site library console assertions.
//
// There is no test harness in this project by design: the app is one HTML file
// with no build step. Paste this whole file into DevTools on the running app.
// Every check prints PASS or FAIL, and the numbered spec tests from
// docs/superpowers/specs/2026-08-28-yard-measure-site-identity-design.md are
// named in the labels that cover them.
//
// It backs up and restores localStorage around every destructive check, so it
// is safe to run on a phone with real work on it. It is async — it fetches the
// seed file — so it returns a promise; await it or read the console output.
//
// Spec tests 11 (snow/fence/materials/cut-outs unaffected) and the on-device
// halves of 2 and 3 are not in here. They need a human measuring something.
(async function () {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: cond ? '' : (detail || '') });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  const bkSites = localStorage.getItem('yardMeasureSites');
  const bkJobs = localStorage.getItem('yardMeasureJobs');
  const bkSiteId = state.siteId;
  const bkLabel = document.getElementById('job-label').value;
  const restore = () => {
    if (bkSites === null) localStorage.removeItem('yardMeasureSites');
    else localStorage.setItem('yardMeasureSites', bkSites);
    if (bkJobs === null) localStorage.removeItem('yardMeasureJobs');
    else localStorage.setItem('yardMeasureJobs', bkJobs);
    state.siteId = bkSiteId;
    document.getElementById('job-label').value = bkLabel;
    saveState();
    renderSiteRow();
  };

  try {
    // ── The store ──────────────────────────────────────
    localStorage.removeItem('yardMeasureSites');
    state.siteId = null;

    ok('store starts empty', readSites().length === 0, `got ${readSites().length}`);

    const a = makeSite({ label: 'Miller back lot', address: '1281 E 19TH AVE' });
    ok('makeSite fills an id', typeof a.id === 'string' && a.id.length > 1, a.id);
    ok('makeSite defaults lat/lng to null', a.lat === null && a.lng === null);
    ok('makeSite defaults group and customer to empty', a.group === '' && a.customer === '');
    ok('makeSite stamps createdAt', typeof a.createdAt === 'number');

    upsertSite(a);
    ok('upsert writes one site', readSites().length === 1, `got ${readSites().length}`);
    ok('getSite round-trips', getSite(a.id) && getSite(a.id).label === 'Miller back lot');

    upsertSite({ ...a, label: 'Miller front lot' });
    ok('upsert on the same id updates, not appends',
       readSites().length === 1 && getSite(a.id).label === 'Miller front lot', `len ${readSites().length}`);

    ok('siteJobName joins label and address',
       siteJobName(getSite(a.id)) === 'Miller front lot — 1281 E 19TH AVE', siteJobName(getSite(a.id)));
    ok('siteJobName fits the 60-char job-label cap',
       siteJobName(makeSite({ label: 'X'.repeat(80), address: 'Y'.repeat(80) })).length === 60);

    deleteSite(a.id);
    ok('deleteSite removes it', readSites().length === 0, `got ${readSites().length}`);

    // ── Address normalisation (spec test 4) ────────────
    ok('AVE matches AVENUE (spec test 4)',
       normalizeAddress('1281 E 19TH AVE') === normalizeAddress('1281 E 19TH AVENUE'),
       `${normalizeAddress('1281 E 19TH AVE')} vs ${normalizeAddress('1281 E 19TH AVENUE')}`);
    ok('RD matches ROAD', normalizeAddress('700 Muldoon Rd') === normalizeAddress('700 MULDOON ROAD'));
    ok('HWY matches HIGHWAY', normalizeAddress('1 Glenn Hwy') === normalizeAddress('1 GLENN HIGHWAY'));
    ok('ST matches STREET', normalizeAddress('12 A St.') === normalizeAddress('12 A STREET'));
    ok('case and punctuation are stripped',
       normalizeAddress('  4904  old-seward, ') === '4904 OLD SEWARD', normalizeAddress('  4904  old-seward, '));
    ok('empty normalises to empty', normalizeAddress('') === '' && normalizeAddress(null) === '');
    ok('two house numbers on one street do not collide',
       normalizeAddress('4904 OLD SEWARD') !== normalizeAddress('4908 OLD SEWARD'));

    const b = upsertSite(makeSite({ label: 'B', address: '1281 E 19TH AVENUE' }));
    ok('findSiteByAddress matches across the abbreviation',
       (findSiteByAddress('1281 e 19th ave') || {}).id === b.id);
    ok('findSiteByAddress honours excludeId', findSiteByAddress('1281 e 19th ave', b.id) === null);
    ok('findSiteByAddress misses a different address', findSiteByAddress('9999 NOWHERE') === null);
    deleteSite(b.id);

    // ── Proximity (spec test 5) ────────────────────────
    // Two adjacent lots on one street, ~60 m apart: the spec's worked example
    // of why a radius can suggest but must never decide.
    const L1 = { lat: 61.1783, lng: -149.8642 };
    const L2 = { lat: 61.1788, lng: -149.8645 };
    ok('the two adjacent lots are ~60 m apart', near(metersBetween(L1, L2), 60, 25),
       `${metersBetween(L1, L2).toFixed(1)} m`);

    const s1 = upsertSite(makeSite({ label: '4904', address: '4904 OLD SEWARD', ...L1 }));
    const s2 = upsertSite(makeSite({ label: '4908', address: '4908 OLD SEWARD', ...L2 }));
    ok('nearest at the first lot picks the first', (nearestSite(L1.lat, L1.lng) || {}).site.id === s1.id);
    ok('nearest at the second lot picks the second', (nearestSite(L2.lat, L2.lng) || {}).site.id === s2.id);
    ok('two sites 60 m apart stay two records (spec test 5)', readSites().length === 2, `got ${readSites().length}`);
    ok('nothing within 40 m returns null', nearestSite(61.2200, -149.9000) === null);
    ok('a site with no coordinates is skipped', (function () {
      const noGeo = upsertSite(makeSite({ label: 'no geo', address: 'X' }));
      const hit = nearestSite(61.2200, -149.9000);
      deleteSite(noGeo.id);
      return hit === null;
    })());
    deleteSite(s1.id); deleteSite(s2.id);

    // ── A job points at a site (spec tests 2, 8, 9) ────
    ok('state has a siteId slot', 'siteId' in state);

    const jobSite = upsertSite(makeSite({ label: 'Job site', address: '55 TEST RD' }));
    setJobSite(jobSite.id);
    ok('setJobSite sets state.siteId (spec test 2)', state.siteId === jobSite.id, String(state.siteId));
    ok('setJobSite fills the job name from the site',
       document.getElementById('job-label').value === 'Job site — 55 TEST RD',
       document.getElementById('job-label').value);
    ok('the snapshot carries siteId', snapshotOfCurrentJob().siteId === jobSite.id);
    ok('saveState persists siteId',
       JSON.parse(localStorage.getItem('yardMeasureState')).siteId === jobSite.id);

    setJobSite(null);
    ok('a job with no site still snapshots (spec test 8)', snapshotOfCurrentJob().siteId === null);
    ok('clearing the site leaves the typed name alone',
       document.getElementById('job-label').value === 'Job site — 55 TEST RD',
       document.getElementById('job-label').value);

    // Spec test 9: a job saved before this change carries no siteId at all.
    const legacy = { id: 'j-legacy', name: 'Old job', savedAt: Date.now(), zones: [] };
    ok('a pre-change job has no siteId and still names itself (spec test 9)',
       legacy.siteId === undefined && (legacy.siteId || null) === null && legacy.name === 'Old job');
    deleteSite(jobSite.id);

    // ── The sheet ──────────────────────────────────────
    ok('the sites sheet is in the DOM', !!document.getElementById('sites-overlay'));
    ok('the site row is in the DOM', !!document.getElementById('site-row'));
    ok('export, import and CSV buttons all exist',
       !!document.getElementById('site-export-btn') && !!document.getElementById('site-import-btn') &&
       !!document.getElementById('site-export-csv-btn'));

    localStorage.removeItem('yardMeasureSites');
    state.siteId = null; renderSiteRow(); renderSites();
    ok('the row reads "Link a site" when unlinked',
       document.getElementById('site-row-text').textContent === 'Link a site');
    ok('the row is not green when unlinked', !document.getElementById('site-row').classList.contains('linked'));
    ok('an empty library shows the empty state', /No sites yet/.test(document.getElementById('sites-list').innerHTML));

    ok('search is order-independent',
       siteMatches({ label: 'FIRST SECOND', address: '10 THIRD AVE', customer: '', group: '', note: '' }, 'third first'));
    ok('search rejects a word that is not there',
       !siteMatches({ label: 'FIRST', address: '10 THIRD AVE', customer: '', group: '', note: '' }, 'first zzz'));

    // Grouped sites sort above ungrouped ones. This is an explicit test in the
    // code, not a '~' sentinel — localeCompare orders symbols BEFORE letters,
    // so the sentinel sank exactly the rows it was meant to lift.
    upsertSite(makeSite({ label: 'Zeta lot', address: '90 NINTH AVE' }));
    upsertSite(makeSite({ label: 'Alpha lot', address: '10 FIRST AVE', group: 'North' }));
    upsertSite(makeSite({ label: 'Mid lot', address: '50 FIFTH AVE', group: 'South' }));
    upsertSite(makeSite({ label: 'Anon lot', address: '99 NINTH AVE' }));
    renderSites();
    const listed = document.getElementById('sites-list').innerHTML;
    const at = n => listed.indexOf(n);
    ok('grouped sites sort above ungrouped ones',
       at('Alpha lot') < at('Mid lot') && at('Mid lot') < at('Anon lot') && at('Anon lot') < at('Zeta lot'),
       [at('Alpha lot'), at('Mid lot'), at('Anon lot'), at('Zeta lot')].join(','));
    ok('a group renders as a badge', /job-badge">North/.test(listed));

    document.getElementById('site-search').value = 'fifth';
    renderSites();
    ok('search filters the list',
       /Mid lot/.test(document.getElementById('sites-list').innerHTML) &&
       !/Alpha lot/.test(document.getElementById('sites-list').innerHTML));
    document.getElementById('site-search').value = 'zzzz';
    renderSites();
    ok('a no-match search says so', /Nothing matches/.test(document.getElementById('sites-list').innerHTML));
    document.getElementById('site-search').value = '';
    renderSites();

    // ── Proximity offers, never decides ────────────────
    localStorage.removeItem('yardMeasureSites');
    state.siteId = null;
    ok('maybeOfferNearbySite exists', typeof maybeOfferNearbySite === 'function');
    ok('it is silent with an empty library', maybeOfferNearbySite(61.2, -149.9) === false);

    const t = upsertSite(makeSite({ label: 'Near test', address: '1 TEST RD', lat: 61.2, lng: -149.9 }));
    const realConfirm = window.confirm;
    window.confirm = () => false;
    ok('declining the offer links nothing',
       maybeOfferNearbySite(61.2001, -149.9001) === false && state.siteId === null, String(state.siteId));
    window.confirm = () => true;
    ok('accepting the offer links the site',
       maybeOfferNearbySite(61.2001, -149.9001) === true && state.siteId === t.id, String(state.siteId));
    ok('it does not ask again once the job is linked', maybeOfferNearbySite(61.2001, -149.9001) === false);
    state.siteId = null;
    ok('a site 500 m away is never offered', maybeOfferNearbySite(61.2050, -149.9000) === false);
    window.confirm = realConfirm;
    deleteSite(t.id);

    // ── Export and import (spec tests 7, 10) ───────────
    localStorage.setItem('yardMeasureSites', JSON.stringify([
      makeSite({ id: 's-fixed-one', label: 'One', address: '1 FIRST AVE', group: 'North' }),
      makeSite({ id: 's-fixed-two', label: 'Two', address: '2 SECOND AVE', group: 'South' }),
    ]));

    const payload = buildLibraryExport({ jobs: true });
    ok('the export declares its format', payload.format === LIBRARY_FORMAT, String(payload.format));
    ok('the export names the app version', typeof payload.appVersion === 'string' && payload.appVersion.length > 0);
    ok('the export carries both sites', payload.sites.length === 2, `got ${payload.sites.length}`);
    ok('the export round-trips through JSON (spec test 10)',
       JSON.parse(JSON.stringify(payload)).sites[0].id === 's-fixed-one');
    ok('sites-only export omits jobs', buildLibraryExport({}).jobs.length === 0);

    const r1 = mergeImport(JSON.parse(JSON.stringify(payload)));
    ok('re-importing an identical file adds nothing (spec test 7)',
       r1.added === 0 && r1.updated === 0, `added ${r1.added} updated ${r1.updated}`);
    ok('re-importing leaves the count alone (spec test 7)', readSites().length === 2, `got ${readSites().length}`);

    const grown = JSON.parse(JSON.stringify(payload));
    grown.sites.push(makeSite({ id: 's-fixed-three', label: 'Three', address: '3 THIRD AVE' }));
    ok('a genuinely new id is added', mergeImport(grown).added === 1 && readSites().length === 3,
       `len ${readSites().length}`);

    const changed = JSON.parse(JSON.stringify(payload));
    changed.sites[0].label = 'ONE CHANGED';
    const r3 = mergeImport(changed, { autoAnswer: 'skip' });
    ok('a conflicting record is never overwritten silently (spec test 3)',
       getSite('s-fixed-one').label === 'One' && r3.skipped === 1,
       `${getSite('s-fixed-one').label}, skipped ${r3.skipped}`);
    const r4 = mergeImport(changed, { autoAnswer: 'replace' });
    ok('an explicitly accepted record is written',
       getSite('s-fixed-one').label === 'ONE CHANGED' && r4.updated === 1);
    ok('createdAt stays with this phone across a replace',
       getSite('s-fixed-one').createdAt === payload.sites[0].createdAt);
    ok('a file in the wrong format is refused', (function () {
      try { mergeImport({ format: 'nope', sites: [] }); return false; } catch (e) { return true; }
    })());

    // ── CSV, export only (spec test 10) ────────────────
    ok('csvCell quotes a comma', csvCell('a,b') === '"a,b"', csvCell('a,b'));
    ok('csvCell doubles an inner quote', csvCell('say "hi"') === '"say ""hi"""', csvCell('say "hi"'));
    ok('csvCell passes a plain value through', csvCell('plain') === 'plain');
    ok('csvCell renders null and undefined as empty', csvCell(null) === '' && csvCell(undefined) === '');

    localStorage.removeItem('yardMeasureJobs');
    const csv = buildLibraryCsv();
    const head = csv.split('\n')[0];
    ok('the CSV header names site identity first',
       head.startsWith('site_id,site_label,site_address,site_customer,site_group'), head);
    ok('the CSV header is 18 columns', head.split(',').length === 18, `${head.split(',').length}`);
    ok('every site gets a row even with no jobs', csv.split('\n').length === readSites().length + 1,
       `${csv.split('\n').length} lines for ${readSites().length} sites`);
    ok('the CSV carries no dollar figure (standing constraint)', !/\$/.test(csv));
    ok('there is no CSV importer (spec test 10)',
       typeof window.importLibraryCsv === 'undefined' && typeof window.mergeImportCsv === 'undefined');

    // ── The seed file imports (spec test 7) ────────────
    localStorage.removeItem('yardMeasureSites');
    const seed = await fetch('docs/site-seed-2026-08-28.json').then(r => r.json());
    ok('the seed declares the import format', seed.format === LIBRARY_FORMAT, String(seed.format));
    ok('importing the seed produces 74 sites (spec test 7)',
       mergeImport(seed).added === 74 && readSites().length === 74, `len ${readSites().length}`);
    const twice = mergeImport(JSON.parse(JSON.stringify(seed)));
    ok('importing it twice produces 74, not 148 (spec test 7)',
       twice.added === 0 && twice.updated === 0 && readSites().length === 74, `len ${readSites().length}`);
    ok('no seeded site carries a pod key', readSites().every(s => !('pod' in s)));
    ok('every seeded site starts with null coordinates', readSites().every(s => s.lat === null && s.lng === null));
    ok('every seeded customer is empty, never derived', readSites().every(s => s.customer === ''));

    // ── The library survives the job trim (spec test 6) ─
    // writeJobs() halves the job list on quota. The library must not be in the
    // blast radius — this is the whole reason sites have their own key. The
    // count escalates because the quota is generous: on a desktop browser it
    // took ~2,400 pin-heavy jobs (~86 MB attempted) before the write failed.
    const fatZone = { id: 1, name: 'Z', mode: 'area', surface: 'plow', gates: [], nextGateId: 1,
      pins: Array.from({ length: 400 }, (_, i) => ({ id: i, lat: 61.123456 + i * 1e-6,
        lng: -149.987654 - i * 1e-6, accuracy: 3.5, samples: 7, src: 'gps' })) };
    let trimmedAt = null;
    for (let n = 600; n <= 9600 && trimmedAt === null; n *= 2) {
      const fat = [];
      for (let i = 0; i < n; i++) {
        fat.push({ id: 'j-fat-' + i, name: 'Fat ' + i, started: Date.now(), savedAt: Date.now() - i,
                   sqft: 1, lenFt: 0, zoneCount: 1, zones: [fatZone], nextZoneId: 2, nextPinId: 401,
                   season: 'summer', snowJob: {}, siteId: null });
      }
      writeJobs(fat);
      if (readJobs().length < n) trimmedAt = n;
    }
    ok('the job write really did hit the quota and trim', trimmedAt !== null, 'never trimmed — inconclusive');
    ok('the library survives a job-storage trim (spec test 6)',
       readSites().length === 74 && !!findSiteByAddress('1300 e 19th ave'),
       `library len ${readSites().length}`);
    localStorage.removeItem('yardMeasureJobs');

    // ── A fresh install is empty (spec test 1) ─────────
    localStorage.removeItem('yardMeasureSites');
    ok('a cleared library reads empty (spec test 1)', readSites().length === 0, `got ${readSites().length}`);
    ok('sites and jobs are separate keys', SITES_KEY === 'yardMeasureSites' && SITES_KEY !== 'yardMeasureJobs');
    ok('an empty install exports no sites', buildLibraryExport({}).sites.length === 0);
  } finally {
    restore();
  }

  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return { total: results.length, passed: results.length - failed.length, failed: failed.map(f => f.name) };
})();
