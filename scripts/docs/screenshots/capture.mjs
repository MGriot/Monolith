// Screenshots for the custom-fields section of the guide (docs/guide/06-tracking.html#custom-fields).
//
// Run against a THROW-AWAY instance (it creates demo fields, a project and tasks), see README.md:
//   DOCS_BASE_URL   frontend, default http://localhost:5175
//   DOCS_API_URL    API base, default http://localhost:8601/api/v1
//   DOCS_USER / DOCS_PASSWORD   a superuser of that instance
//   DOCS_BROWSER_CHANNEL        optional: msedge / chrome to use an installed browser instead of Playwright's Chromium
//   DOCS_ONLY       optional: comma-separated shot names to (re)take
//
// Output: docs/img/guide/<name>.webp at 1440x900, light theme, like the other guide images.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { login, seed } from './seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../../docs/img/guide');
const BASE = (process.env.DOCS_BASE_URL || 'http://localhost:5175').replace(/\/$/, '');
const API = process.env.DOCS_API_URL || 'http://localhost:8601/api/v1';
const ONLY = new Set((process.env.DOCS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
const VIEWPORT = { width: 1440, height: 900 };

if (!process.env.DOCS_USER || !process.env.DOCS_PASSWORD) {
  console.error('Set DOCS_USER and DOCS_PASSWORD (a superuser of a throw-away instance).');
  process.exit(2);
}

const token = await login(API, process.env.DOCS_USER, process.env.DOCS_PASSWORD);
const { project } = await seed(API, token);

const browser = await chromium.launch(process.env.DOCS_BROWSER_CHANNEL ? { channel: process.env.DOCS_BROWSER_CHANNEL } : {});
// en-GB: the same number and date format in every capture, whatever the machine's locale
const context = await browser.newContext({
  viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London',
});
await context.addInitScript((t) => localStorage.setItem('token', t), token);
const page = await context.newPage();
await mkdir(OUT, { recursive: true });

async function save(name) {
  if (ONLY.size && !ONLY.has(name)) return;
  await page.waitForTimeout(400); // let toasts and transitions settle
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).webp({ quality: 82 }).toFile(resolve(OUT, `${name}.webp`));
  console.log(`saved ${name}.webp`);
}

/** Scroll an element to the top of its scroll container, leaving a little air above it. */
async function scrollToTop(locator, offset = 24) {
  await locator.evaluate((el, off) => {
    el.scrollIntoView({ block: 'start' });
    let p = el.parentElement;
    while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
    (p || document.scrollingElement)?.scrollBy(0, -off);
  }, offset);
}

const projectUrl = `${BASE}/projects/${project.id}`;

// 1. Admin › Metadata › Custom fields: the global fields every project gets
await page.goto(`${BASE}/admin/metadata`);
await page.getByTestId('custom-fields-global-project').getByText('Approved budget').waitFor();
await scrollToTop(page.locator('#custom-fields'));
await save('custom-fields-admin-global');

// 2. Project overview: financials in the instance currency and the project field values
await page.goto(projectUrl);
await page.getByTestId('project-field-values').getByText('Operations').waitFor();
await save('custom-fields-project-overview');

// 3. Task list: the first task fields as columns
const effortHeader = page.locator('th', { hasText: 'Effort' });
await effortHeader.waitFor({ state: 'attached' });
await effortHeader.scrollIntoViewIfNeeded(); // the table scrolls sideways: bring the field columns in
await scrollToTop(page.getByText('Tasks & Subtasks'), 16);
await save('custom-fields-task-list-columns');

// 4. A task's Fields tab
await page.getByRole('row', { name: /Order barcode scanners/ }).getByText('Order barcode scanners').click();
const dialog = page.getByRole('dialog');
await dialog.getByRole('tab', { name: 'Fields' }).click();
await dialog.getByText('Vendor quote').waitFor();
await save('custom-fields-task-values');
await page.keyboard.press('Escape');

// 5. Project settings: project fields and task fields, global ones read-only
await page.getByRole('button', { name: 'Project Settings' }).click();
const projectFields = page.getByTestId('custom-fields-project-project');
await projectFields.getByText('Cost centre').waitFor();
await scrollToTop(projectFields);
await save('custom-fields-project-settings');

// 6. The definition editor with a number field's unit, limits and decimals (filled in, not saved)
const taskFields = page.getByTestId('custom-fields-project-task');
await taskFields.getByLabel('Name').last().fill('Lead time');
await taskFields.getByLabel('Type').last().selectOption('number');
await taskFields.getByLabel('Unit').last().fill('days');
await taskFields.getByLabel('Minimum').last().fill('0');
await taskFields.getByLabel('Maximum').last().fill('90');
await taskFields.getByLabel('Decimals').last().selectOption('0');
await scrollToTop(taskFields.getByText('New field'), 280);
await save('custom-fields-editor-types');

// 7. The project editor's Fields tab
await scrollToTop(page.getByText('Project details'), 16);
await page.getByRole('tab', { name: 'Fields' }).first().click();
await page.getByLabel('Client portal', { exact: true }).waitFor();
await save('custom-fields-project-values');

await browser.close();
