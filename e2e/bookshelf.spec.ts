import { promises as files } from 'node:fs';
import { expect, test } from '@playwright/test';

test.describe('The Virtual Bookshelf — Primary E2E User Flows', () => {
  test('full lifecycle: register, customize shelf, search/manual add, inspect 3D cover, reorder & persist across reload, remove, logout/login', async ({
    page,
    browserName,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile-viewport';
    const username = `e2e_${browserName}_${isMobile ? 'm' : 'd'}_${Date.now()}`;
    const password = 'LibraryPassword123';

    await page.goto('/');

    // 1. Register a fresh isolated account (with curated classics)
    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create My Bookshelf' }).click();

    // Bookshelf renders as physical cabinet with books
    const cabinet = page.getByTestId('bookshelf-cabinet');
    await expect(cabinet).toBeVisible();
    await expect(cabinet).toHaveAttribute('data-theme', 'walnut');

    // Verify books have distinct heights/widths on the shelf
    const duneSpine = page.locator('button[aria-label^="Dune by Frank Herbert"]');
    const calvinoSpine = page.locator('button[aria-label^="Invisible Cities by Italo Calvino"]');
    await expect(duneSpine).toBeVisible();
    await expect(calvinoSpine).toBeVisible();

    const duneBox = await duneSpine.boundingBox();
    const calvinoBox = await calvinoSpine.boundingBox();
    expect(duneBox).not.toBeNull();
    expect(calvinoBox).not.toBeNull();
    expect(duneBox!.width).toBeGreaterThan(calvinoBox!.width);
    expect(duneBox!.height).toBeGreaterThan(calvinoBox!.height);

    // On mobile, verify bookshelf stays readable (wide scrollable cabinet, never squished tiny)
    if (isMobile) {
      const cabinetBox = await cabinet.boundingBox();
      expect(cabinetBox!.width).toBeGreaterThanOrEqual(640);
      return;
    }

    // 2. Customize shelf: change wood finish to European Oak & add a 4th shelf level
    await page.getByTestId('open-customizer-btn').click();
    await page.getByRole('button', { name: /European Oak/i }).click();
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.getByRole('button', { name: 'Apply Changes' }).click();

    await expect(cabinet).toHaveAttribute('data-theme', 'oak');
    await page.reload();
    await expect(page.getByTestId('bookshelf-cabinet')).toHaveAttribute('data-theme', 'oak');

    // 3. Add a custom book manually & verify immediate arrival + persistence
    await page.getByTestId('open-search-btn').click();
    await page.getByRole('button', { name: /Manual Entry/i }).click();
    await expect(page.getByTestId('manual-book-modal')).toBeVisible();
    await page.getByTestId('manual-title-input').fill('The Library of Babel');
    await page.getByTestId('manual-author-input').fill('Jorge Luis Borges');
    await page.getByTestId('manual-submit-btn').click();

    const addedSpine = page.locator('button[aria-label^="The Library of Babel by Jorge Luis Borges"]');
    await expect(addedSpine).toBeVisible();

    // 4. Click book spine -> 3D Book Reveal Modal -> check metadata, estimated badge, & move shelf
    await addedSpine.click();
    const modal = page.getByTestId('book-reveal-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Estimated Dimensions')).toBeVisible();

    // Rotate 3D book to inspect spine & back
    await modal.getByRole('button', { name: 'Inspect Spine' }).click();
    await modal.getByRole('button', { name: 'Turn to Front Cover' }).click();

    // Move book to another shelf compartment using accessible Shelf Position controls
    await modal.getByRole('button', { name: 'Shelf Position' }).click();
    const select = modal.locator('#move-compartment-select');
    const optionValues = await select.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );
    const destCompId = optionValues[optionValues.length - 1];
    await select.selectOption(destCompId);
    await modal.getByRole('button', { name: 'Return to Shelf' }).click();

    // Verify new compartment placement survives full page reload!
    await page.reload();
    const destCompartment = page.getByTestId(`compartment-${destCompId}`);
    await expect(
      destCompartment.locator('button[aria-label^="The Library of Babel by Jorge Luis Borges"]')
    ).toBeVisible();

    // 5. Drag-and-drop reorder within Shelf 1 (drag Moby-Dick before Dune) & verify survives reload
    const firstComp = page.locator('[data-testid^="compartment-"]').first();
    const firstCompBooksBefore = await firstComp
      .locator('.book-slot')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-book-id')));
    expect(firstCompBooksBefore.length).toBeGreaterThanOrEqual(3);

    const sourceEl = firstComp.locator('.book-slot').nth(1).locator('button');
    const targetEl = firstComp.locator('.book-slot').nth(0).locator('button');
    const srcBox = await sourceEl.boundingBox();
    const tgtBox = await targetEl.boundingBox();
    if (srcBox && tgtBox) {
      await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(tgtBox.x + 4, tgtBox.y + tgtBox.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(450);
    }

    await page.reload();
    await expect(
      page.locator('[data-testid^="compartment-"]').first().locator('.book-slot').first()
    ).toBeVisible();
    const firstCompBooksAfter = await page
      .locator('[data-testid^="compartment-"]')
      .first()
      .locator('.book-slot')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-book-id')));
    expect(firstCompBooksAfter[0]).toBe(firstCompBooksBefore[1]);

    // 6. Remove the manually added book & verify persisted removal
    await page
      .locator('button[aria-label^="The Library of Babel by Jorge Luis Borges"]')
      .click();
    await page.getByTestId('remove-book-btn').click();
    await page.getByTestId('confirm-remove-book-btn').click();
    await expect(
      page.locator('button[aria-label^="The Library of Babel by Jorge Luis Borges"]')
    ).toHaveCount(0);

    await page.reload();
    await expect(
      page.locator('button[aria-label^="The Library of Babel by Jorge Luis Borges"]')
    ).toHaveCount(0);

    // 7. Search modal opens & queries live catalog cleanly
    await page.getByTestId('open-search-btn').click();
    await expect(page.getByTestId('book-search-modal')).toBeVisible();
    await page.getByTestId('book-search-input').fill('9780141439518');
    await page.getByTestId('book-search-submit').click();
    await expect(page.locator('[data-testid^="search-result-"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Escape');

    // 8. Logout & Login persistence check
    await page.getByTestId('account-menu-btn').click();
    await page.getByTestId('logout-btn').click();
    await expect(page.getByRole('button', { name: 'Enter My Library' })).toBeVisible();

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Enter My Library' }).click();
    await expect(page.getByTestId('bookshelf-cabinet')).toHaveAttribute('data-theme', 'oak');
  });
});

test('reviews a two-row import, shares a shelf, and restores a backup on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-viewport', 'Mobile workflow');
  const username = `e2e_scan_${Date.now()}`;
  await page.route('**/api/books/scan-shelf/status', (route) =>
    route.fulfill({ json: { enabled: true, model: 'test' } })
  );
  await page.route('**/api/books/scan-shelf', (route) => route.fulfill({
    json: {
      model: 'test',
      cached: false,
      detectedCount: 2,
      matchedCount: 0,
      books: [
        { scanId: 'front', shelfRow: 1, position: 1, detectedTitle: 'The Orchard', detectedAuthor: 'Alex Lee' },
        { scanId: 'back', shelfRow: 2, position: 1, detectedTitle: 'A Garden of Paper', detectedAuthor: 'Sam Kaya' },
      ].map((book) => ({
        ...book, language: null, spineColorHex: null, confidence: 'high', matchStatus: 'unmatched', matches: [],
      })),
    },
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('LibraryPassword123');
  await page.getByLabel('Stock with classic sample editions').uncheck();
  await page.getByRole('button', { name: 'Create My Bookshelf' }).click();

  await page.getByTestId('open-search-btn').click();
  await page.getByTestId('scan-photo-tab-btn').click();
  await page.getByTestId('shelf-photo-input').setInputFiles({
    name: 'rows.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLdUAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByTestId('analyze-shelf-btn').click();
  await page.getByLabel('Keep photo layout').check();
  const first = await page.getByLabel('Photo row 1').inputValue();
  const second = await page.getByLabel('Photo row 2').inputValue();
  expect(first).not.toBe(second);
  await page.getByRole('button', { name: 'Shelve 2 Books' }).click();

  await expect(page.getByTestId('book-search-modal')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`compartment-${first}`).getByRole('button', { name: /^The Orchard by Alex Lee/ })).toBeVisible();
  await expect(page.getByTestId(`compartment-${second}`).getByRole('button', { name: /^A Garden of Paper by Sam Kaya/ })).toBeVisible();

  await page.getByRole('button', { name: 'Share shelf', exact: true }).click();
  const preview = page.getByRole('textbox', { name: 'Book list preview' });
  await expect(preview).toHaveValue(/The Orchard — Alex Lee\n• A Garden of Paper — Sam Kaya/);
  await page.getByRole('button', { name: 'Close share dialog' }).click();
  await expect(preview).toHaveCount(0);

  await page.getByTestId('account-menu-btn').click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download library backup' }).click(),
  ]);
  expect(backup.suggestedFilename()).toBe('bookshelf-backup.json');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Restore shelves as copies' }).click(),
  ]);
  await chooser.setFiles({
    name: backup.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await files.readFile(await backup.path()),
  });
  await expect(page.getByText('Restored 1 shelf as copies.')).toBeVisible();
  const library = await page.request.get('/api/bookshelves');
  expect((await library.json()).bookshelves).toHaveLength(2);
});
