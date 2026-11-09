// End-to-end smoke test. Run: npm run build && npm run e2e
// Uses the pre-installed Playwright + Chromium against `vite preview`.
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const URL = 'http://localhost:4174/';
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const money = async (page, label) => (await page.locator('.card', { hasText: label }).first().locator('.tabular-nums').first().innerText()).trim();

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 1. Create a real account
    await page.getByRole('link', { name: 'Add our first account' }).click();
    await page.getByRole('button', { name: '+ Add account' }).click();
    await page.getByPlaceholder('e.g. CommBank Everyday').fill('Test Everyday');
    await page.getByPlaceholder('0.00').fill('1000');
    await page.getByRole('button', { name: 'Save' }).click();
    check('account created with balance', (await page.getByText('$1,000.00').count()) > 0);

    // 2. Quick expense (timed)
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByLabel('Amount').fill('45.50');
    await page.getByPlaceholder('e.g. Woolworths').fill('Coles');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('quick expense saved fast', Date.now() - t0 < 5000, `${Date.now() - t0}ms of automation`);
    await page.goto(URL + '#/accounts');
    check('balance reduced by expense', (await page.getByText('$954.50').count()) > 0);

    // 3. Validation
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('validation blocks empty amount', (await page.getByText('Enter an amount greater than $0').count()) > 0);
    await page.keyboard.press('Escape');

    // 4. Pending bill -> mark paid
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Bill', exact: true }).click();
    await page.getByLabel('Amount').fill('120');
    await page.getByPlaceholder('e.g. Woolworths').fill('Electricity');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/bills');
    check('bill listed as unpaid', (await page.getByText('Electricity').count()) > 0);
    await page.getByRole('button', { name: 'Paid' }).first().click();
    await page.getByRole('button', { name: 'Confirm paid' }).click();
    await page.goto(URL + '#/accounts');
    check('paying bill reduces balance', (await page.getByText('$834.50').count()) > 0);

    // 5. Recurring income: expected, not counted until confirmed
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    await page.getByLabel('Amount').fill('2000');
    await page.getByPlaceholder('e.g. My Salary').fill('My Salary');
    await page.getByLabel('Frequency').selectOption('fortnightly');
    await page.getByLabel('This payment already received').uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/accounts');
    check('expected income not added to balance', (await page.getByText('$834.50').count()) > 0);
    await page.goto(URL + '#/recurring');
    await page.getByRole('button', { name: 'Received' }).first().click();
    await page.getByRole('button', { name: 'Confirm received' }).click();
    await page.goto(URL + '#/accounts');
    check('confirmed income added to balance', (await page.getByText('$2,834.50').count()) > 0);

    // 6. Persistence across reload
    await page.reload();
    check('data persists after reload', (await page.getByText('$2,834.50').count()) > 0);

    // 7. Transactions: duplicate + delete
    await page.goto(URL + '#/transactions');
    const before = await page.locator('li', { hasText: 'Coles' }).count();
    await page.getByRole('button', { name: 'Duplicate Coles' }).first().click();
    check('duplicate creates a copy', (await page.locator('li', { hasText: 'Coles' }).count()) === before + 1);

    // 8. Credit card: purchase + payment must count spending ONCE
    await page.goto(URL + '#/cards');
    await page.getByRole('button', { name: '+ Add card' }).click();
    await page.getByPlaceholder('e.g. Low Rate Visa').fill('Test Visa');
    await page.getByLabel('Credit limit').fill('5000');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.goto(URL);
    const spentBefore = await money(page, 'Expenses this month');
    await page.goto(URL + '#/cards');
    await page.getByRole('button', { name: '+ Purchase' }).click();
    await page.getByLabel('Amount').fill('300');
    await page.getByPlaceholder('e.g. Woolworths').fill('Shoes');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('card debt shows purchase', (await page.getByText('$300.00').count()) > 0);
    await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await page.getByRole('button', { name: /Full balance/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/accounts');
    check('card payment reduces bank balance', (await page.getByText('$2,489.00').count()) > 0);
    await page.goto(URL);
    await page.waitForTimeout(300);
    const spentAfter = await money(page, 'Expenses this month');
    const toC = (s) => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);
    check('purchase + payment counted once in spending', toC(spentAfter) - toC(spentBefore) === 30000, `${spentBefore} -> ${spentAfter}`);
    check('card debt back to zero', (await money(page, 'Credit card debt')) === '$0.00');

    if (process.env.EXTRA) await require(process.env.EXTRA)(page, URL, check, money);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    check('no runtime errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    server.kill();
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
  }
})();
