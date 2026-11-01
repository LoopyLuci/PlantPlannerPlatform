import { expect, test, type Page } from '@playwright/test';

/**
 * Journeys from the design transcript's journey table (J1, J5), run against the real
 * server and the production build. Fresh scratch data: a starter garden is created
 * on first load.
 */

async function openWindow(page: Page, name: string) {
  // Nav buttons carry a count badge after the label, so match the label as a whole word.
  await page.getByRole('navigation', { name: 'Windows' }).getByRole('button', { name: new RegExp(`^${name}\\b`) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** The coordinate text of the first placed plant whose name matches. */
async function placedCoords(page: Page, common: string) {
  await openWindow(page, 'Placed plants');
  const row = page.locator('.placement-row', { hasText: common }).first();
  await expect(row).toBeVisible();
  return (await row.locator('.coords').innerText()).trim();
}

test.describe('J1 place and validate', () => {
  test('a species added from the library is validated, corrected by keyboard, and survives reload', async ({ page }) => {
    await page.goto('/#/plants');
    await expect(page.getByRole('heading', { level: 1, name: 'Plant library' })).toBeVisible();

    await page.getByPlaceholder('Name or family').fill('lavender');
    const result = page.getByRole('button', { name: /lavender/i }).first();
    await expect(result).toBeVisible();
    await result.click();
    await page.getByRole('button', { name: 'Add to plan' }).click();

    // Adding a species opens the plan with the new plant selected.
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    const strip = page.locator('.selection-strip');
    await expect(strip).toContainText(/lavender/i);
    const statusBefore = await strip.innerText();
    expect(statusBefore).toMatch(/Good fit|Check this|Problem|Unknown/);

    const before = await placedCoords(page, 'Lavender');

    // Correct the position with the arrow keys on the plan (one undoable move).
    await openWindow(page, 'Plan');
    await expect(strip).toContainText(/lavender/i);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    await expect.poll(() => placedCoords(page, 'Lavender')).not.toBe(before);
    const after = await placedCoords(page, 'Lavender');

    // The corrected position is stored: a reload shows the same coordinates.
    await page.reload();
    await expect.poll(() => placedCoords(page, 'Lavender')).toBe(after);
  });
});

test.describe('J5 encyclopedia lookup', () => {
  test('search finds lavender, the profile shows its traits and sources', async ({ page }) => {
    await page.goto('/#/plants');
    const search = page.getByPlaceholder('Name or family');
    await search.fill('lavender');

    const result = page.getByRole('button', { name: /lavender/i }).first();
    await expect(result).toBeVisible();
    await result.click();

    const profile = page.locator('.split-detail');
    await expect(profile).toContainText(/lavender/i);
    await expect(profile).toContainText(/Sources?/i);
    await expect(profile.getByRole('button', { name: 'Add to plan' })).toBeVisible();
  });
});

test.describe('Feedback on a verdict', () => {
  test('a dispute is recorded and routed to a human', async ({ page }) => {
    await page.goto('/#/placements');
    await page.locator('.placement-row').first().click();
    await openWindow(page, 'Plant details');

    const form = page.locator('.feedback-form');
    await expect(form).toBeVisible();
    await form.getByRole('textbox').fill('The bed is shadier than the site survey says.');
    await form.getByRole('button', { name: 'Send feedback' }).click();

    await expect(form.getByRole('status')).toContainText(/^Recorded\. It goes to /);
  });
});
