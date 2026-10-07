import { promises as fs } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
const password = 'F11-local-e2e-password';
const viewports = [375, 414, 768, 1024, 1280, 1440];
let testPhoneSequence = 0;
const testPhoneBase = 1_000_000 + (Date.now() % 8_000_000);

function nextTestPhone(): string {
  const localNumber = testPhoneBase + testPhoneSequence++;
  return `+25078${String(localNumber).padStart(7, '0').slice(-7)}`;
}
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
async function register(page: Page, role: 'LANDLORD' | 'TENANT', suffix: string) {
  await page.goto(
    `/register?returnTo=${encodeURIComponent(role === 'LANDLORD' ? '/landlord/properties' : '/')}`,
  );
  await page.getByLabel('First name').fill('F11');
  await page.getByLabel('Last name').fill(`E2E ${role}`);
  await page.getByLabel('Email').fill(`f11-${role.toLowerCase()}-${suffix}@example.test`);
  await page.getByLabel('Phone').fill(nextTestPhone());
  await page.getByLabel('Password').fill(password);
  await page
    .getByText(role === 'LANDLORD' ? 'I want to list a property' : "I'm looking for a home", {
      exact: true,
    })
    .click();
  const [registrationResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Create account' }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  const hasSessionCookie = (await page.context().cookies()).some(
    (cookie) => cookie.name === 'rrp_session' && cookie.value.length > 0,
  );
  console.log(
    `[F11 auth] register=${registrationResponse.status()} sessionCookie=${hasSessionCookie} login=not-used (registration auto-login) url=${page.url()}`,
  );
}
async function createProperty(page: Page, title: string) {
  await page.goto('/landlord/properties/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Property type').selectOption('HOUSE');
  await page
    .getByLabel('Description')
    .fill('A local Playwright test property for the F11 lifecycle.');
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Monthly rent (RWF)').fill('300000');
  await page.getByLabel('Security deposit (RWF)').fill('300000');
  await page.getByLabel('Other charges (RWF)').fill('0');
  await page.getByLabel('Province').fill('Kigali City');
  await page.getByLabel('District').fill('Gasabo');
  await page.getByLabel('Sector').fill('Remera');
  await page.getByLabel('Cell').fill('Rukiri');
  await page.getByLabel('Village / area').fill('F11 E2E Area');
  await page.getByRole('button', { name: 'Create property' }).click();
  await expect(page).toHaveURL(/\/landlord\/properties\/(?!new$)[^/]+$/);
}
async function deleteProperty(page: Page, propertyUrl: string) {
  await page.goto(propertyUrl);
  const unpublish = page.getByRole('button', { name: 'Unpublish' });
  if (await unpublish.isVisible().catch(() => false)) {
    await unpublish.click();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete property' }).click();
  await expect(page).toHaveURL(/\/landlord\/properties$/);
}
async function writeImages(testInfo: TestInfo) {
  const first = testInfo.outputPath('f11-first.png');
  const second = testInfo.outputPath('f11-second.png');
  await fs.writeFile(first, pngBytes);
  await fs.writeFile(second, pngBytes);
  return { first, second };
}
async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
test.describe('F11 landlord property lifecycle', () => {
  test('landlord can create, edit, manage images, publish, unpublish, republish, and delete', async ({
    page,
    browser,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = `F11 E2E ${suffix}`;
    const updatedTitle = `${title} Updated`;
    let propertyUrl: string | undefined;
    let otherContext;
    try {
      await register(page, 'LANDLORD', suffix);
      await createProperty(page, title);
      propertyUrl = page.url();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();
      await expect(page.getByText('Available')).toBeVisible();
      await page.getByRole('link', { name: 'Edit' }).click();
      await page.getByLabel('Title').fill('');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('A title is required.')).toBeVisible();
      await page.getByLabel('Title').fill(updatedTitle);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page).toHaveURL(propertyUrl);
      await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
      const images = await writeImages(testInfo);
      await page.locator('input[type=file]').setInputFiles(images.first);
      await expect(page.getByText('1 of 20')).toBeVisible();
      await page.locator('input[type=file]').setInputFiles(images.second);
      await expect(page.getByText('2 of 20')).toBeVisible();
      await page.getByRole('button', { name: 'Set primary' }).click();
      await expect(page.getByRole('button', { name: 'Primary', exact: true })).toBeDisabled();
      const secondImageSrc = await page
        .getByRole('img', { name: 'Property photo 2' })
        .getAttribute('src');
      expect(secondImageSrc).toBeTruthy();
      await page.goto('/landlord/properties');
      const cardImage = page.getByRole('img', { name: `${updatedTitle} primary image` });
      await expect(cardImage).toHaveAttribute('src', secondImageSrc!);
      await page.goto(propertyUrl);
      const firstBefore = await page
        .getByRole('img', { name: 'Property photo 1' })
        .getAttribute('src');
      const secondBefore = await page
        .getByRole('img', { name: 'Property photo 2' })
        .getAttribute('src');
      await page.getByRole('button', { name: 'Move photo 1 later' }).click();
      await expect(page.getByRole('img', { name: 'Property photo 1' })).toHaveAttribute(
        'src',
        secondBefore!,
      );
      await page.reload();
      await expect(page.getByRole('img', { name: 'Property photo 1' })).toHaveAttribute(
        'src',
        secondBefore!,
      );
      expect(firstBefore).not.toBe(secondBefore);
      await page.getByRole('button', { name: 'Delete photo 2' }).click();
      await expect(page.getByRole('img', { name: 'Property photo 2' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Publish' }).click();
      await expect(page.getByText('Published', { exact: true })).toBeVisible();
      const publicLink = page.getByRole('link', { name: 'View public listing' });
      await expect(publicLink).toBeVisible();
      const publicUrl = await publicLink.getAttribute('href');
      expect(publicUrl).toBeTruthy();
      await page.goto('/properties');
      await expect(page.getByRole('link', { name: updatedTitle })).toBeVisible();
      await page.getByRole('link', { name: updatedTitle }).click();
      await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
      await expect(page.locator(`img[alt^="${updatedTitle}"]`)).toHaveCount(1);
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(propertyUrl);
        await expectNoHorizontalOverflow(page);
        await page.goto(publicUrl!, { waitUntil: 'domcontentloaded' });
        await expectNoHorizontalOverflow(page);
      }
      await page.goto(propertyUrl);
      await page.getByRole('button', { name: 'Unpublish' }).click();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();
      await page.goto(publicUrl!, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Property not found' })).toBeVisible();
      await page.goto(propertyUrl);
      await page.getByRole('button', { name: 'Publish' }).click();
      await expect(page.getByText('Published', { exact: true })).toBeVisible();
      await page.goto(publicUrl!, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await register(otherPage, 'LANDLORD', `${suffix}-other`);
      await otherPage.goto(propertyUrl);
      await expect(otherPage.getByText(/this property could not be found/i)).toBeVisible();
      await otherContext.close();
      otherContext = undefined;
    } finally {
      await otherContext?.close().catch(() => undefined);
      if (propertyUrl) await deleteProperty(page, propertyUrl).catch(() => undefined);
    }
  });
  test('anonymous users are redirected and tenants cannot access landlord management', async ({
    page,
  }) => {
    await page.goto('/landlord/properties');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await register(page, 'TENANT', suffix);
    await page.goto('/landlord/properties');
    await expect(page.getByText(/property management is available to landlords/i)).toBeVisible();
    await expect(page.getByText('My properties')).not.toBeVisible();
  });
});
