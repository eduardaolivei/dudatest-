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
const has = (page, text) => page.getByText(text).first().waitFor({ timeout: 4000 }).then(() => true, () => false);
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
    check('account created with balance', (await has(page, '$1,000.00')));

    // 2. Quick expense (timed)
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByLabel('Amount').fill('45.50');
    await page.getByPlaceholder('e.g. Woolworths').fill('Coles');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('quick expense saved fast', Date.now() - t0 < 5000, `${Date.now() - t0}ms of automation`);
    await page.goto(URL + '#/accounts');
    check('balance reduced by expense', (await has(page, '$954.50')));

    // 3. Validation
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('validation blocks empty amount', (await has(page, 'Enter an amount greater than $0')));
    await page.keyboard.press('Escape');

    // 4. Pending bill -> mark paid
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Bill', exact: true }).click();
    await page.getByLabel('Amount').fill('120');
    await page.getByPlaceholder('e.g. Woolworths').fill('Electricity');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/bills');
    check('bill listed as unpaid', (await has(page, 'Electricity')));
    await page.getByRole('button', { name: 'Paid' }).first().click();
    await page.getByRole('button', { name: 'Confirm paid' }).click();
    await page.goto(URL + '#/accounts');
    check('paying bill reduces balance', (await has(page, '$834.50')));

    // 5. Recurring income: expected, not counted until confirmed
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    await page.getByLabel('Amount').fill('2000');
    await page.getByPlaceholder('e.g. My Salary').fill('My Salary');
    await page.getByLabel('Frequency').selectOption('fortnightly');
    await page.getByLabel('This payment already received').uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/accounts');
    check('expected income not added to balance', (await has(page, '$834.50')));
    await page.goto(URL + '#/recurring');
    await page.getByRole('button', { name: 'Received' }).first().click();
    await page.getByRole('button', { name: 'Confirm received' }).click();
    await page.goto(URL + '#/accounts');
    check('confirmed income added to balance', (await has(page, '$2,834.50')));

    // 6. Persistence across reload
    await page.reload();
    check('data persists after reload', (await has(page, '$2,834.50')));

    // 7. Transactions: duplicate + delete
    await page.goto(URL + '#/transactions');
    await page.getByRole('button', { name: 'Duplicate Coles' }).first().waitFor();
    const before = await page.locator('li', { hasText: 'Coles' }).count();
    await page.getByRole('button', { name: 'Duplicate Coles' }).first().click();
    await page.waitForTimeout(200);
    check('duplicate creates a copy', (await page.locator('li', { hasText: 'Coles' }).count()) === before + 1);

    // 8. Credit card: purchase + payment must count spending ONCE
    await page.goto(URL + '#/cards');
    await page.getByRole('button', { name: '+ Add credit card' }).click();
    check('debit card guidance shown on Cards', await has(page, "Debit cards don't go here."));
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
    check('card debt shows purchase', (await has(page, '$300.00')));
    await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await page.getByRole('button', { name: /Full balance/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/accounts');
    check('card payment reduces bank balance', (await has(page, '$2,489.00')));
    await page.goto(URL);
    await page.waitForTimeout(300);
    const spentAfter = await money(page, 'Expenses this month');
    const toC = (s) => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);
    check('purchase + payment counted once in spending', toC(spentAfter) - toC(spentBefore) === 30000, `${spentBefore} -> ${spentAfter}`);
    check('card debt back to zero', (await money(page, 'Credit card debt')) === '$0.00');

    // 9. Backup -> erase -> restore
    await page.goto(URL + '#/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download backup/ }).click()]);
    const backupPath = await dl.path();
    const backup = JSON.parse(require('fs').readFileSync(backupPath, 'utf8'));
    check('backup contains transactions', backup.transactions.length >= 5, `${backup.transactions.length} tx`);
    await page.getByRole('button', { name: 'Erase all data' }).click();
    await page.getByRole('button', { name: 'Tap again to erase everything' }).click();
    await page.goto(URL);
    check('erase returns to welcome screen', (await has(page, 'Welcome to Our Money Dashboard')));
    await page.goto(URL + '#/settings');
    await page.getByTestId('restore-input').setInputFiles(backupPath);
    await page.getByRole('button', { name: 'Replace with backup' }).click();
    await page.goto(URL + '#/accounts');
    check('restore brings data back', (await has(page, '$2,489.00')));

    // 10. Demo data can be removed without touching real data
    await page.goto(URL + '#/settings');
    await page.getByRole('button', { name: 'Load demo data' }).click();
    await page.getByRole('button', { name: 'Remove demo data' }).click();
    await page.getByRole('button', { name: 'Tap again to remove' }).click();
    await page.goto(URL + '#/accounts');
    const realKept = await has(page, '$2,489.00');
    check('demo removed, real data kept', realKept && (await page.getByText('Demo Everyday').count()) === 0);

    // 11. Dark mode + PWA basics
    await page.goto(URL + '#/settings');
    await page.getByRole('tab', { name: 'Dark' }).click();
    check('dark mode applies', await page.evaluate(() => document.documentElement.classList.contains('dark')));
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    check('manifest is valid', manifest.display === 'standalone' && manifest.icons.length >= 2);
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
    check('service worker registered', sw);

    // 12. Budgets: set, edit, remove, and follow the salary's cycle
    await page.goto(URL + '#/budgets');
    await page.getByRole('button', { name: 'Set Groceries limit' }).click();
    await page.getByLabel('Limit amount').fill('600');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('budget limit can be set', await has(page, 'of $600.00'));
    await page.getByRole('button', { name: 'Edit Groceries limit' }).click();
    await page.getByLabel('Limit amount').fill('450');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    check('budget limit can be edited and persists', await has(page, 'of $450.00'));
    await page.getByRole('button', { name: 'Budget cycle' }).click();
    await page.getByRole('button', { name: 'Save cycle' }).click(); // default: follow "My Salary" (fortnightly)
    check('budget follows salary cycle', (await has(page, 'fortnightly budget')) && (await has(page, /days? left|Last day/)));
    check('limit converted monthly -> fortnightly', await has(page, 'of $208.00'));

    // 12b. Add more budgets: a subcategory and a brand-new subcategory
    await page.getByRole('button', { name: 'Add budget' }).click();
    await page.getByLabel('Budget name').fill('Coffee');
    await page.getByLabel('Limit amount').fill('40');
    await page.getByRole('button', { name: 'Save budget' }).click();
    check('subcategory budget added', await has(page, 'of $40.00'));
    await page.getByRole('button', { name: 'Add budget' }).click();
    await page.getByLabel('Budget name').fill('Uber Eats');
    await page.getByLabel('Limit amount').fill('50');
    await page.getByRole('button', { name: 'Save budget' }).click();
    check('custom subcategory budget added', await has(page, 'Uber Eats'));
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByLabel('Amount').fill('22');
    await page.getByPlaceholder('e.g. Woolworths').fill('Dinner delivery');
    await page.locator('select').filter({ hasText: 'Uber Eats' }).selectOption('Uber Eats');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('spending counts against custom budget', await has(page, '$28.00 left'));

    // 12c. Collapse / expand subcategories
    await page.getByRole('button', { name: 'Hide Groceries subcategories' }).click();
    check('collapsing hides subcategories', (await page.getByText('of $40.00').count()) === 0 && (await has(page, /2 items/)));
    await page.reload();
    check('collapsed state remembered', (await page.getByText('of $40.00').count()) === 0);
    await page.getByRole('button', { name: 'Expand all' }).click();
    check('expand all shows them again', await has(page, 'of $40.00'));

    // 12d. Editing bills (wrong amount / date)
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Bill', exact: true }).click();
    await page.getByLabel('Amount').fill('80');
    await page.getByPlaceholder('e.g. Woolworths').fill('Water');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/bills');
    await page.getByRole('button', { name: 'Edit Water' }).click();
    await page.getByLabel('Amount').fill('95');
    await page.getByRole('button', { name: 'Save changes' }).click();
    check('one-off bill amount edited', await has(page, '$95.00'));

    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Bill', exact: true }).click();
    await page.getByLabel('Amount').fill('70');
    await page.getByPlaceholder('e.g. Woolworths').fill('Internet');
    await page.getByLabel('Frequency').selectOption('monthly');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Internet' }).first().click();
    await page.getByLabel('Bill amount').fill('75.50');
    await page.getByRole('button', { name: 'Save this bill' }).click();
    check('recurring bill: only this one edited', await has(page, '$75.50'));

    const unpaidCount = () => page.getByRole('button', { name: 'Paid', exact: true }).count();
    const n0 = await unpaidCount();
    await page.getByRole('button', { name: 'Paid', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirm paid' }).click();
    await page.waitForTimeout(200);
    const n1 = await unpaidCount();
    await page.locator('section', { hasText: 'Paid —' }).getByRole('button', { name: /^Edit / }).first().click();
    await page.getByRole('button', { name: 'Not paid yet (undo)' }).click();
    await page.getByRole('button', { name: 'Tap again to undo payment' }).click();
    await page.waitForTimeout(200);
    const n2 = await unpaidCount();
    check('paid bill can be undone', n1 === n0 - 1 && n2 === n0, `${n0} -> ${n1} -> ${n2}`);

    // 12e. Day / night toggle in the top bar
    await page.goto(URL);
    const darkNow = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
    const before2 = await darkNow();
    await page.getByRole('button', { name: before2 ? 'Switch to day mode' : 'Switch to night mode' }).click();
    const after1 = await darkNow();
    await page.reload();
    const afterReload = await darkNow();
    await page.getByRole('button', { name: afterReload ? 'Switch to day mode' : 'Switch to night mode' }).click();
    check('day/night toggle works and is remembered', after1 === !before2 && afterReload === after1 && (await darkNow()) === before2);

    // 12f. Categories: add a subcategory, use it in an expense, create one from the form, rename
    await page.goto(URL + '#/categories');
    await page.getByLabel('New subcategory in Groceries').fill('Bakery');
    await page.getByRole('button', { name: 'Add subcategory to Groceries' }).click();
    check('subcategory added in Categories', await has(page, 'Bakery'));
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByLabel('Amount').fill('7.80');
    await page.getByPlaceholder('e.g. Woolworths').fill('Bread');
    await page.getByRole('dialog').getByLabel('Subcategory', { exact: true }).selectOption('Bakery');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByLabel('Amount').fill('12');
    await page.getByPlaceholder('e.g. Woolworths').fill('Dog food');
    await page.getByRole('dialog').getByLabel('Category', { exact: true }).selectOption('Other');
    await page.getByRole('dialog').getByLabel('Subcategory', { exact: true }).selectOption('__new_sub__');
    await page.getByLabel('New subcategory name').fill('Pets');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/categories');
    check('new subcategory created from the expense form', await has(page, 'Pets'));
    await page.getByRole('button', { name: 'Edit Bakery in Groceries' }).click();
    await page.getByLabel('Subcategory name').fill('Bakery & Cafe');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(URL + '#/transactions');
    check('rename updates past transactions', await has(page, 'Bakery & Cafe'));

    // 12g. Things We Want to Buy: wish categories (built-in + new)
    await page.goto(URL + '#/planner');
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByRole('dialog').getByLabel('Product name').fill('MacBook Air');
    await page.getByRole('dialog').getByLabel('Estimated price').fill('1899');
    await page.getByLabel('Wish category').selectOption('Tech');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByRole('dialog').getByLabel('Product name').fill('Viagem para o Brasil');
    await page.getByRole('dialog').getByLabel('Estimated price').fill('6000');
    await page.getByLabel('Wish category').selectOption('__new__');
    await page.getByLabel('New category name').fill('Brazil trip');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    check('wish grouped under Tech', await has(page, '💻'));
    check('new wish category created', await has(page, 'Brazil trip'));
    await page.getByRole('button', { name: /Brazil trip · 1/ }).click();
    check('filter by wish category', (await page.getByText('MacBook Air').count()) === 0 && (await has(page, 'Viagem para o Brasil')));
    await page.getByRole('button', { name: '+ Add item' }).click();
    const opts = await page.getByLabel('Wish category').locator('option').allInnerTexts();
    check('new category offered next time', opts.some((o) => o.includes('Brazil trip')));
    await page.keyboard.press('Escape');

    // 12g2. Payment plan on a card (24 months, 6 already paid)
    await page.goto(URL + '#/cards');
    await page.getByRole('button', { name: '+ Payment plan' }).first().click();
    await page.getByLabel('Plan name').fill('iPhone 17');
    await page.getByLabel('Monthly instalment').fill('100');
    await page.getByLabel('Instalments already paid').fill('6');
    await page.getByLabel('Already in card balance').selectOption('no');
    check('plan preview shows what is left', await has(page, '18 instalments of $100.00'));
    await page.getByRole('button', { name: 'Save plan' }).click();
    check('plan listed on the card', (await has(page, 'PAYMENT PLANS')) && (await has(page, '6 of 24')) && (await has(page, '$1,800.00')));

    // 12h. Close a credit card (keeps history), reopen, then delete it with its transactions
    await page.goto(URL + '#/cards');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('button', { name: 'Close card (keep history)' }).click();
    check('closed card hidden from Cards', await has(page, 'Closed cards (1)'));
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await page.getByRole('button', { name: 'Card purchase' }).click();
    check('closed card not offered for new purchases', await has(page, 'Add a credit card first') || (await page.getByText('Add a card').count()) > 0);
    await page.keyboard.press('Escape');
    await page.getByText('Closed cards (1)').click();
    await page.getByRole('button', { name: 'Manage Test Visa' }).click();
    await page.getByRole('button', { name: /^Delete card \+ \d+ transactions?$/ }).click();
    await page.getByRole('button', { name: /Tap again: delete card/ }).click();
    await page.waitForTimeout(300);
    check('card deleted with its transactions', (await page.getByText('Closed cards').count()) === 0 && (await has(page, 'No cards yet')));

    // 13. Every page renders without crashing
    for (const r of ['transactions', 'bills', 'cards', 'goals', 'budgets', 'planner', 'week', 'reports', 'assistant', 'recurring', 'more', 'categories']) {
      await page.goto(URL + '#/' + r);
      await page.waitForTimeout(150);
      if ((await page.locator('h1').count()) === 0) check(`page ${r} renders`, false);
    }
    check('all pages render', true);

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
