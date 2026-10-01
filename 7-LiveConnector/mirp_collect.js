async (page) => {
  // Customer Success Control Tower - MIRP collector (read-only).
  // Run with Playwright (Scout: playwright-browser_run_code_unsafe, filename = this file) in a browser signed in to Engage Center.
  // Replays the portal's own query calls with the user's session, for every workspace the user can see.
  // The result stays in the page as window.__csctMirp; save it with browser_evaluate(() => window.__csctMirp, filename = mirp-latest.json),
  // then run mirp_apply.py. The access token is never returned, printed or stored.
  const MIRP_URL = 'https://engagecenter.microsoft.com/#view/Microsoft_AzureCXP_EngageHub/EngageHubMenu.MenuView/~/mirpReview';
  const GW = 'https://gateway.engagehub.azure.com';
  const started = new Date().toISOString();
  const keep = (out) => page.evaluate((o) => { window.__csctMirp = o; }, out).catch(() => {});
  const fail = async (reason) => {
    const out = { tool: 'csct-mirp-collect', version: 1, checkedAtUtc: started, ok: false, error: reason, url: page.url().split('#')[0] };
    await keep(out);
    return JSON.stringify({ ok: false, error: reason });
  };

  for (let i = 0; i < 3 && !page.url().includes('/~/mirpReview'); i++) {
    await page.goto(MIRP_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(8000);
  }
  if (/login\.microsoftonline\.com|\/auth\/login/i.test(page.url())) { return fail('signed-out: sign in to engagecenter.microsoft.com in the Scout browser'); }
  if (!page.url().includes('/~/mirpReview')) { return fail('could not open the MIRP page: ' + page.url().split('#')[0]); }

  const seen = {};
  const onReq = (r) => {
    const u = r.url();
    if (!seen.spaces && u.startsWith(GW + '/sp/spaces/query')) { seen.spaces = { url: u, method: r.method(), headers: r.headers(), body: r.postData() }; }
    if (!seen.att && u.startsWith(GW + '/dmirp/dmirp-attestations')) { seen.att = { url: u, headers: r.headers() }; }
  };
  page.on('request', onReq);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 90 && !(seen.spaces && seen.att); i++) { await page.waitForTimeout(1000); }
  } finally {
    page.off('request', onReq);
  }
  if (!seen.spaces || !seen.att) { return fail('portal calls not observed (spaces: ' + !!seen.spaces + ', attestations: ' + !!seen.att + ')'); }

  const clean = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !/^(:|sec-|host$|content-length$|connection$|accept-encoding$)/i.test(k)));
  const api = page.context().request;
  const spRes = await api.fetch(seen.spaces.url, { method: seen.spaces.method, headers: clean(seen.spaces.headers), data: seen.spaces.body || '{}' });
  if (!spRes.ok()) { return fail('workspace list returned HTTP ' + spRes.status()); }
  const spJson = await spRes.json();
  const spaces = (spJson && spJson.values) || [];
  if (!spaces.length) { return fail('workspace list is empty'); }

  const capScope = seen.att.headers['x-eh-scope'] || '';
  const results = [];
  for (const s of spaces) {
    const base = { id: s.id, name: s.name, type: s.type, parents: (s.ancestors || []).map((a) => (a && (a.name || a.id)) || String(a)) };
    if (s.type === 'Rollup' || String(s.id).startsWith('r/')) { results.push(Object.assign(base, { status: 'Skipped' })); continue; }
    let url = seen.att.url;
    if (capScope) { url = url.split(capScope).join(s.id).split(encodeURIComponent(capScope)).join(encodeURIComponent(s.id)); }
    const h = clean(seen.att.headers);
    h['x-eh-scope'] = s.id;
    let res;
    try { res = await api.fetch(url, { method: 'GET', headers: h }); } catch (e) { results.push(Object.assign(base, { status: 'Error', error: String(e.message).slice(0, 120) })); continue; }
    if (!res.ok()) { results.push(Object.assign(base, { status: 'Error', http: res.status() })); continue; }
    const j = await res.json().catch(() => null);
    const list = Array.isArray(j) ? j : (j && j.attestedOnUtc ? [j] : null);
    if (list === null) { results.push(Object.assign(base, { status: 'Error', error: 'unexpected response shape' })); continue; }
    const att = list.filter((x) => x && x.attestedOnUtc).sort((a, b) => String(b.attestedOnUtc).localeCompare(String(a.attestedOnUtc)))[0];
    if (!att) { results.push(Object.assign(base, { status: 'Pending' })); continue; }
    results.push(Object.assign(base, { status: 'Confirmed', by: (att.by && att.by.name) || null, on: att.attestedOnUtc }));
  }

  const count = (st) => results.filter((r) => r.status === st).length;
  const out = { tool: 'csct-mirp-collect', version: 1, checkedAtUtc: started, ok: true, totalCount: spJson.totalCount || spaces.length, results };
  await keep(out);
  return JSON.stringify({
    ok: true, workspaces: results.length, totalCount: out.totalCount,
    confirmed: count('Confirmed'), pending: count('Pending'), skipped: count('Skipped'), errors: count('Error'),
    pendingNames: results.filter((r) => r.status === 'Pending').map((r) => r.name),
    errorNames: results.filter((r) => r.status === 'Error').map((r) => r.name)
  });
}
