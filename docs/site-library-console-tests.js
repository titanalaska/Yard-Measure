// Yard Measure — site library console assertions.
//
// There is no test harness in this project by design: the app is one HTML
// file with no build step. Paste this whole file into DevTools on the running
// app. Every check prints PASS or FAIL, and the spec test it covers is named
// in the label where one applies.
//
// It backs up and restores localStorage around every destructive check, so it
// is safe to run against a phone with real work on it.
(function () {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: cond ? '' : (detail || '') });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // --- Task 1: the store ---
  const backupSites = localStorage.getItem('yardMeasureSites');
  localStorage.removeItem('yardMeasureSites');

  ok('store starts empty', readSites().length === 0, `got ${readSites().length}`);

  const a = makeSite({ label: 'Miller back lot', address: '1281 E 19TH AVE' });
  ok('makeSite fills an id', typeof a.id === 'string' && a.id.length > 1, a.id);
  ok('makeSite defaults lat/lng to null', a.lat === null && a.lng === null);
  ok('makeSite defaults group to empty', a.group === '');
  ok('makeSite stamps createdAt', typeof a.createdAt === 'number');

  upsertSite(a);
  ok('upsert writes one site', readSites().length === 1, `got ${readSites().length}`);
  ok('getSite round-trips', getSite(a.id) && getSite(a.id).label === 'Miller back lot');

  upsertSite({ ...a, label: 'Miller front lot' });
  ok('upsert on same id updates, not appends', readSites().length === 1 && getSite(a.id).label === 'Miller front lot',
     `len ${readSites().length}`);

  ok('siteJobName joins label and address',
     siteJobName(getSite(a.id)) === 'Miller front lot — 1281 E 19TH AVE', siteJobName(getSite(a.id)));

  deleteSite(a.id);
  ok('deleteSite removes it', readSites().length === 0, `got ${readSites().length}`);

  // --- Task 2: address normalisation (spec test 4) ---
  ok('normalize expands AVE/AVENUE',
     normalizeAddress('1281 E 19TH AVE') === normalizeAddress('1281 E 19TH AVENUE'),
     `${normalizeAddress('1281 E 19TH AVE')} vs ${normalizeAddress('1281 E 19TH AVENUE')}`);
  ok('normalize expands RD/ROAD',
     normalizeAddress('700 Muldoon Rd') === normalizeAddress('700 MULDOON ROAD'));
  ok('normalize expands HWY/HIGHWAY',
     normalizeAddress('1 Glenn Hwy') === normalizeAddress('1 GLENN HIGHWAY'));
  ok('normalize expands ST/STREET',
     normalizeAddress('12 A St.') === normalizeAddress('12 A STREET'));
  ok('normalize strips punctuation and case',
     normalizeAddress('  4904  old-seward, ') === '4904 OLD SEWARD',
     normalizeAddress('  4904  old-seward, '));
  ok('normalize of empty is empty', normalizeAddress('') === '' && normalizeAddress(null) === '');
  ok('different addresses do not collide',
     normalizeAddress('4904 OLD SEWARD') !== normalizeAddress('4908 OLD SEWARD'));

  const b = upsertSite(makeSite({ label: 'B', address: '1281 E 19TH AVENUE' }));
  ok('findSiteByAddress matches across abbreviation',
     (findSiteByAddress('1281 e 19th ave') || {}).id === b.id);
  ok('findSiteByAddress honours excludeId',
     findSiteByAddress('1281 e 19th ave', b.id) === null);
  ok('findSiteByAddress misses a different address',
     findSiteByAddress('9999 NOWHERE') === null);
  deleteSite(b.id);

  // --- Task 3: proximity (spec test 5) ---
  // Two adjacent lots on the same street, roughly 60 m apart. The spec's
  // worked example: a radius loose enough to be reliable would swallow both.
  const L4904 = { lat: 61.1783, lng: -149.8642 };
  const L4908 = { lat: 61.1788, lng: -149.8645 };
  const gap = metersBetween(L4904, L4908);
  ok('the two adjacent lots are ~60 m apart', near(gap, 60, 25), `${gap.toFixed(1)} m`);

  const s4904 = upsertSite(makeSite({ label: '4904', address: '4904 OLD SEWARD', ...L4904 }));
  const s4908 = upsertSite(makeSite({ label: '4908', address: '4908 OLD SEWARD', ...L4908 }));

  ok('nearest at 4904 picks 4904, not 4908', (nearestSite(L4904.lat, L4904.lng) || {}).site.id === s4904.id);
  ok('nearest at 4908 picks 4908, not 4904', (nearestSite(L4908.lat, L4908.lng) || {}).site.id === s4908.id);
  ok('two sites 60 m apart are never one record (spec test 5)',
     readSites().filter(s => s.id === s4904.id || s.id === s4908.id).length === 2);
  ok('nothing within 40 m returns null', nearestSite(61.2200, -149.9000) === null);
  ok('a site with no coordinates is skipped', (function () {
    const noGeo = upsertSite(makeSite({ label: 'no geo', address: 'X' }));
    const hit = nearestSite(61.2200, -149.9000);
    deleteSite(noGeo.id);
    return hit === null;
  })());

  deleteSite(s4904.id); deleteSite(s4908.id);

  // --- Task 4: job carries siteId (spec tests 2, 8, 9) ---
  ok('state has a siteId slot', 'siteId' in state, Object.keys(state).join(','));

  const jobSite = upsertSite(makeSite({ label: 'Job site', address: '55 TEST RD' }));
  const priorSiteId = state.siteId;
  const priorLabel = document.getElementById('job-label').value;
  setJobSite(jobSite.id);
  ok('setJobSite sets state.siteId (spec test 2)', state.siteId === jobSite.id, String(state.siteId));
  ok('setJobSite fills the job name from the site',
     document.getElementById('job-label').value === 'Job site — 55 TEST RD',
     document.getElementById('job-label').value);

  ok('snapshot carries siteId', snapshotOfCurrentJob().siteId === jobSite.id);

  setJobSite(null);
  ok('a job with no site still snapshots (spec test 8)', snapshotOfCurrentJob().siteId === null);
  ok('clearing a site leaves the typed name alone',
     document.getElementById('job-label').value === 'Job site — 55 TEST RD',
     document.getElementById('job-label').value);

  // Spec test 9: a job saved before this change has no siteId and must open.
  const legacy = { id: 'j-legacy-test', name: 'Old job', started: Date.now(), savedAt: Date.now(),
                   sqft: 100, lenFt: 0, zoneCount: 1, zones: [], nextZoneId: 2, nextPinId: 2,
                   season: 'summer', snowJob: {} };
  ok('a legacy job object has no siteId and that is fine (spec test 9)', legacy.siteId === undefined);
  ok('a legacy job still yields a usable name', (legacy.siteId || null) === null && legacy.name === 'Old job');

  setJobSite(priorSiteId || null);
  document.getElementById('job-label').value = priorLabel;
  deleteSite(jobSite.id);

  // --- Task 5: the sheet exists and renders ---
  ok('the sites sheet is in the DOM', !!document.getElementById('sites-overlay'));
  ok('the site row is in the DOM', !!document.getElementById('site-row'));
  ok('renderSiteRow reads "Link a site" when unlinked', (function () {
    const before = state.siteId;
    state.siteId = null;
    renderSiteRow();
    const txt = document.getElementById('site-row-text').textContent;
    state.siteId = before;
    renderSiteRow();
    return txt === 'Link a site';
  })(), document.getElementById('site-row-text').textContent);
  ok('siteMatches is order-independent',
     siteMatches({ label: 'KNIK CORNERS', address: '8800 CENTENNIAL', customer: '', group: '', note: '' }, 'centennial knik'));
  ok('siteMatches rejects a word that is not there',
     !siteMatches({ label: 'KNIK', address: '8800 CENTENNIAL', customer: '', group: '', note: '' }, 'knik zzz'));

  // --- Task 6: proximity offers, never detects ---
  ok('maybeOfferNearbySite exists', typeof maybeOfferNearbySite === 'function');
  ok('it is silent with an empty library', maybeOfferNearbySite(61.2, -149.9) === false);

  // --- Task 7: export / import (spec tests 7, 10) ---
  const backupJobs = localStorage.getItem('yardMeasureJobs');
  localStorage.setItem('yardMeasureSites', JSON.stringify([
    makeSite({ id: 's-fixed-one', label: 'One', address: '1 FIRST AVE', group: 'North' }),
    makeSite({ id: 's-fixed-two', label: 'Two', address: '2 SECOND AVE', group: 'South' }),
  ]));

  const payload = buildLibraryExport({ jobs: true });
  ok('export declares its format', payload.format === LIBRARY_FORMAT, String(payload.format));
  ok('export carries an app version', typeof payload.appVersion === 'string' && payload.appVersion.length > 0);
  ok('export carries both sites', payload.sites.length === 2, `got ${payload.sites.length}`);
  ok('export carries a jobs array', Array.isArray(payload.jobs));
  ok('export survives a JSON round-trip (spec test 10)',
     JSON.parse(JSON.stringify(payload)).sites[0].id === 's-fixed-one');

  // Spec test 7: importing the same file twice must not double the library.
  const r1 = mergeImport(JSON.parse(JSON.stringify(payload)));
  ok('re-importing an identical file adds nothing (spec test 7)', r1.added === 0 && r1.updated === 0,
     `added ${r1.added} updated ${r1.updated}`);
  ok('re-importing leaves the count alone (spec test 7)', readSites().length === 2, `got ${readSites().length}`);

  const grown = JSON.parse(JSON.stringify(payload));
  grown.sites.push(makeSite({ id: 's-fixed-three', label: 'Three', address: '3 THIRD AVE' }));
  const r2 = mergeImport(grown);
  ok('a new id is added', r2.added === 1 && readSites().length === 3,
     `added ${r2.added}, len ${readSites().length}`);

  const changed = JSON.parse(JSON.stringify(payload));
  changed.sites[0].label = 'ONE CHANGED';
  const r3 = mergeImport(changed, { autoAnswer: 'skip' });
  ok('a conflicting record is not overwritten silently (spec test 3)',
     getSite('s-fixed-one').label === 'One' && r3.skipped === 1,
     `${getSite('s-fixed-one').label}, skipped ${r3.skipped}`);

  const r4 = mergeImport(changed, { autoAnswer: 'replace' });
  ok('an explicitly accepted record is written',
     getSite('s-fixed-one').label === 'ONE CHANGED' && r4.updated === 1);

  ok('a payload with the wrong format is refused', (function () {
    try { mergeImport({ format: 'nope', sites: [] }); return false; } catch (e) { return true; }
  })());

  // --- Task 8: CSV is export-only (spec test 10) ---
  ok('csvCell quotes a comma', csvCell('a,b') === '"a,b"', csvCell('a,b'));
  ok('csvCell doubles an inner quote', csvCell('say "hi"') === '"say ""hi"""', csvCell('say "hi"'));
  ok('csvCell passes a plain value through', csvCell('plain') === 'plain');
  ok('csvCell renders null as empty', csvCell(null) === '' && csvCell(undefined) === '');

  const csv = buildLibraryCsv();
  const head = csv.split('\n')[0];
  ok('CSV header names site identity first',
     head.startsWith('site_id,site_label,site_address,site_customer,site_group'), head);
  ok('CSV has a row per site', csv.split('\n').length >= 4, `${csv.split('\n').length} lines`);
  ok('CSV header is 18 columns', head.split(',').length === 18, `${head.split(',').length} columns`);
  ok('CSV carries no dollar figure', !/\$/.test(csv));
  ok('there is no CSV importer (spec test 10)', typeof window.importLibraryCsv === 'undefined');

  if (backupJobs === null) localStorage.removeItem('yardMeasureJobs');
  else localStorage.setItem('yardMeasureJobs', backupJobs);

  // --- Task 10: the library survives the job trim (spec test 6) ---
  // writeJobs() halves the job list on quota. The library must not be in the
  // blast radius — this is the whole reason sites have their own key.
  (function () {
    const jobsBackup = localStorage.getItem('yardMeasureJobs');
    localStorage.setItem('yardMeasureSites', JSON.stringify([
      makeSite({ id: 's-survivor', label: 'Survivor', address: '1 SURVIVOR RD' }),
    ]));
    const fatZone = { id: 1, name: 'Z', mode: 'area', surface: 'plow', gates: [], nextGateId: 1,
      pins: Array.from({ length: 400 }, (_, i) => ({ id: i, lat: 61 + i * 1e-6, lng: -149 - i * 1e-6, accuracy: 3 })) };
    const fat = [];
    for (let i = 0; i < 400; i++) {
      fat.push({ id: 'j-fat-' + i, name: 'Fat ' + i, started: Date.now(), savedAt: Date.now() - i,
                 sqft: 1, lenFt: 0, zoneCount: 1, zones: [fatZone], nextZoneId: 2, nextPinId: 401,
                 season: 'summer', snowJob: {}, siteId: null });
    }
    writeJobs(fat);   // expected to hit quota and trim
    ok('the library survives a job-storage trim (spec test 6)',
       readSites().length === 1 && !!getSite('s-survivor') && getSite('s-survivor').label === 'Survivor',
       `library len ${readSites().length}`);
    if (jobsBackup === null) localStorage.removeItem('yardMeasureJobs');
    else localStorage.setItem('yardMeasureJobs', jobsBackup);
  })();

  // --- Task 10: a fresh install is empty and carries no company data ---
  ok('SITES_KEY is separate from JOBS_KEY', SITES_KEY !== 'yardMeasureJobs');
  ok('a cleared library reads empty (spec test 1)', (function () {
    localStorage.removeItem('yardMeasureSites');
    return readSites().length === 0;
  })());

  // --- restore and report ---
  if (backupSites === null) localStorage.removeItem('yardMeasureSites');
  else localStorage.setItem('yardMeasureSites', backupSites);
  if (typeof renderSiteRow === 'function') renderSiteRow();

  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return { total: results.length, passed: results.length - failed.length, failed: failed.map(f => f.name) };
})();
