// Cloud sync E2E: two browsers (Duda + Patrick) against an in-memory fake of the
// Supabase HTTP API, exercising the real supabase-js client in the app.
// Run: npm run build && node e2e/cloud.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const crypto = require('crypto');

const APP = 'http://localhost:4176/';
const SB = 'https://testproject.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from(JSON.stringify({ role: 'anon', iss: 'supabase' })).toString('base64url') + '.signature';
let failures = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) failures++; };

// ---- fake backend -------------------------------------------------------
const users = {}; // email -> {id, password}
const tokens = {}; // token -> userId
const households = []; // {id,name,invite_code,data,version,members:[]}
function jwt(uid, email) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: uid, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}
function session(email) {
  const u = users[email];
  const t = jwt(u.id, email);
  tokens[t] = u.id;
  return { access_token: t, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  const uid = tokens[(req.headers()['authorization'] || '').replace('Bearer ', '')];
  const p = url.pathname;
  if (p === '/auth/v1/signup') {
    if (users[body.email]) return json(400, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    users[body.email] = { id: crypto.randomUUID(), password: body.password };
    return json(200, session(body.email));
  }
  if (p === '/auth/v1/token') {
    const u = users[body.email];
    if (!u || u.password !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, session(body.email));
  }
  if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: cors });
  if (p.startsWith('/auth/v1/user')) return json(200, session(Object.keys(users).find((e) => users[e].id === uid)).user);
  if (p.startsWith('/rest/v1/')) {
    if (!uid) return json(401, { message: 'JWT required' });
    const mine = households.filter((h) => h.members.includes(uid));
    const row = (h) => ({ id: h.id, name: h.name, invite_code: h.invite_code, data: h.data, version: h.version });
    if (p === '/rest/v1/rpc/create_household') {
      const h = { id: crypto.randomUUID(), name: body.p_name, invite_code: crypto.randomBytes(5).toString('hex').toUpperCase(), data: body.p_data, version: 1, members: [uid] };
      households.push(h);
      return json(200, row(h));
    }
    if (p === '/rest/v1/rpc/join_household') {
      const h = households.find((x) => x.invite_code === String(body.p_code).trim().toUpperCase());
      if (!h) return json(400, { code: 'P0001', message: 'Invite code not found' });
      if (!h.members.includes(uid)) h.members.push(uid);
      return json(200, row(h));
    }
    if (p === '/rest/v1/rpc/save_household') {
      const h = mine.find((x) => x.id === body.p_id);
      if (!h) return json(400, { code: 'P0001', message: 'Not a member of this household' });
      if (h.version !== body.p_expected_version) return json(200, -1);
      h.data = body.p_data; h.version++; h.updatedAt = Date.now();
      return json(200, h.version);
    }
    if (p === '/rest/v1/households') {
      const idf = url.searchParams.get('id');
      let rows = mine;
      if (idf) rows = rows.filter((h) => h.id === idf.replace('eq.', ''));
      const sel = (url.searchParams.get('select') || '').split(',');
      const field = (h, k) => (k === 'household_members(count)' ? ['household_members', [{ count: h.members.length }]] : k === 'updated_at' ? [k, h.updatedAt || 0] : [k, row(h)[k]]);
      const out = rows.map((h) => Object.fromEntries(sel.map((k) => field(h, k))));
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (single) return out.length === 1 ? json(200, out[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
      return json(200, out);
    }
    return json(404, { message: 'not mocked ' + p });
  }
  return json(404, { message: 'not mocked ' + p });
}

async function browserFor(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route(SB + '/**', handle);
  await ctx.routeWebSocket(/supabase\.co/, (ws) => ws.close()); // no realtime in the fake: app falls back to checks
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, errors };
}
const has = (page, t, timeout = 6000) => page.getByText(t).first().waitFor({ timeout }).then(() => true, () => false);

async function setupCloud(page, email, mode) {
  await page.goto(APP + '#/settings');
  if (mode !== 'skip-connect') {
    await page.getByPlaceholder('https://abcdefgh.supabase.co').fill(SB);
    await page.getByPlaceholder(/eyJhbGciOi/).fill(KEY);
    await page.getByRole('button', { name: 'Connect' }).click();
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Password/).fill('secret123');
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
}

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch();
  try {
    const duda = await browserFor(browser);
    const pat = await browserFor(browser);

    // Duda has local data, then turns on cloud sync and creates the household
    await duda.page.goto(APP);
    await duda.page.getByRole('link', { name: 'Add our first account' }).click();
    await duda.page.getByRole('button', { name: '+ Add account' }).click();
    await duda.page.getByPlaceholder('e.g. CommBank Everyday').fill('Joint Everyday');
    await duda.page.getByPlaceholder('0.00').fill('1500');
    await duda.page.getByRole('button', { name: 'Save' }).click();

    // config validation
    await duda.page.goto(APP + '#/settings');
    await duda.page.getByPlaceholder('https://abcdefgh.supabase.co').fill('https://example.com');
    await duda.page.getByPlaceholder(/eyJhbGciOi/).fill(KEY);
    await duda.page.getByRole('button', { name: 'Connect' }).click();
    check('rejects a wrong Project URL', await has(duda.page, 'should look like https://'));

    await setupCloud(duda.page, 'duda@example.com');
    await duda.page.getByRole('button', { name: 'Create', exact: true }).click();
    check('household created', await has(duda.page, 'Invite code — share it with your partner'));
    const code = (await duda.page.locator('.font-mono.text-lg').innerText()).trim();
    check('invite code shown', /^[0-9A-F]{10}$/.test(code), code);
    check('local data uploaded', households[0]?.data?.accounts?.[0]?.name === 'Joint Everyday');
    check('status synced', await has(duda.page, 'All changes saved to the cloud'));

    // Patrick on his phone: empty app, creates account, joins with the code
    await setupCloud(pat.page, 'patrick@example.com');
    await pat.page.getByLabel('Invite code').fill(code.toLowerCase());
    await pat.page.getByRole('button', { name: 'Join' }).click();
    check('Patrick joined', await has(pat.page, 'Invite code — share it with your partner'));
    await pat.page.goto(APP + '#/accounts');
    check("Patrick sees Duda's account", await has(pat.page, 'Joint Everyday'));

    // Patrick adds an expense -> Duda receives it
    await pat.page.getByRole('button', { name: 'Add transaction' }).click();
    await pat.page.getByLabel('Amount').fill('64.30');
    await pat.page.getByPlaceholder('e.g. Woolworths').fill('Woolies by Patrick');
    await pat.page.getByRole('button', { name: 'Save', exact: true }).click();
    await pat.page.waitForTimeout(2500); // debounce + upload
    check('Patrick change reached the cloud', (households[0].data.transactions || []).some((t) => t.description === 'Woolies by Patrick'));
    await duda.page.goto(APP + '#/transactions');
    await duda.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    check('Duda receives Patrick change', await has(duda.page, 'Woolies by Patrick', 8000));

    // Duda edits at the same time as Patrick -> both kept
    await duda.page.getByRole('button', { name: 'Add transaction' }).click();
    await duda.page.getByLabel('Amount').fill('5.50');
    await duda.page.getByPlaceholder('e.g. Woolworths').fill('Coffee by Duda');
    await duda.page.getByRole('button', { name: 'Save', exact: true }).click();
    await pat.page.getByRole('button', { name: 'Add transaction' }).click();
    await pat.page.getByLabel('Amount').fill('80');
    await pat.page.getByPlaceholder('e.g. Woolworths').fill('Fuel by Patrick');
    await pat.page.getByRole('button', { name: 'Save', exact: true }).click();
    await duda.page.waitForTimeout(3500);
    await pat.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await duda.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await duda.page.waitForTimeout(2000);
    const descs = (households[0].data.transactions || []).map((t) => t.description).sort();
    check('simultaneous edits both kept in cloud', descs.includes('Coffee by Duda') && descs.includes('Fuel by Patrick') && descs.includes('Woolies by Patrick'), descs.join(', '));

    // Reload keeps the session and data
    await duda.page.reload();
    await duda.page.goto(APP + '#/settings');
    check('session survives reload', await has(duda.page, 'duda@example.com'));

    // Sign in on a new device finds the household automatically
    const laptop = await browserFor(browser);
    await laptop.page.goto(APP + '#/settings');
    await laptop.page.getByPlaceholder('https://abcdefgh.supabase.co').fill(SB);
    await laptop.page.getByPlaceholder(/eyJhbGciOi/).fill(KEY);
    await laptop.page.getByRole('button', { name: 'Connect' }).click();
    await laptop.page.getByRole('button', { name: 'I have an account' }).click();
    await laptop.page.getByLabel('Email').fill('duda@example.com');
    await laptop.page.getByLabel(/Password/).fill('wrongpass');
    await laptop.page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    check('wrong password message', await has(laptop.page, 'Email or password is incorrect'));
    await laptop.page.getByLabel(/Password/).fill('secret123');
    await laptop.page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    check('new device auto-connects to household', await has(laptop.page, 'Invite code — share it with your partner'));
    await laptop.page.goto(APP + '#/transactions');
    check('new device has all data', await has(laptop.page, 'Fuel by Patrick'));

    // Mistake: a person taps Create instead of Join, then fixes it with the partner's code
    const oops = await browserFor(browser);
    await setupCloud(oops.page, 'oops@example.com');
    check('Join is offered first', await has(oops.page, 'Joining your partner? Use their invite code'));
    await oops.page.getByRole('button', { name: 'Create', exact: true }).click();
    check('created a separate household by mistake', await has(oops.page, 'Invite code — share it with your partner'));
    const wrongCode = (await oops.page.locator('.font-mono.text-lg').innerText()).trim();
    check('it is a different household', wrongCode !== code, `${wrongCode} vs ${code}`);
    await oops.page.getByRole('button', { name: /Join a different household/ }).click();
    await oops.page.getByLabel('Partner invite code').fill(code);
    await oops.page.getByRole('button', { name: 'Join', exact: true }).click();
    await oops.page.waitForTimeout(500);
    if (await oops.page.getByRole('button', { name: 'Combine both (recommended)' }).count()) await oops.page.getByRole('button', { name: 'Combine both (recommended)' }).click();
    await oops.page.waitForTimeout(800);
    const nowCode = (await oops.page.locator('.font-mono.text-lg').innerText()).trim();
    check('switched to the shared household', nowCode === code, nowCode);
    await oops.page.goto(APP + '#/transactions');
    check('sees the shared data after switching', await has(oops.page, 'Fuel by Patrick', 8000));
    // A fresh device for this person picks the shared household (2+ members), not the empty one
    const oops2 = await browserFor(browser);
    await oops2.page.goto(APP + '#/settings');
    await oops2.page.getByPlaceholder('https://abcdefgh.supabase.co').fill(SB);
    await oops2.page.getByPlaceholder(/eyJhbGciOi/).fill(KEY);
    await oops2.page.getByRole('button', { name: 'Connect' }).click();
    await oops2.page.getByRole('button', { name: 'I have an account' }).click();
    await oops2.page.getByLabel('Email').fill('oops@example.com');
    await oops2.page.getByLabel(/Password/).fill('secret123');
    await oops2.page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await has(oops2.page, 'Invite code — share it with your partner');
    const code2 = (await oops2.page.locator('.font-mono.text-lg').innerText()).trim();
    check('new device picks the shared household', code2 === code, code2);
    duda.errors.push(...oops.errors, ...oops2.errors);

    check('no runtime errors', duda.errors.length + pat.errors.length + laptop.errors.length === 0, [...duda.errors, ...pat.errors, ...laptop.errors].join(' | '));
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
    server.kill();
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll cloud checks passed');
    process.exit(failures ? 1 : 0);
  }
})();
