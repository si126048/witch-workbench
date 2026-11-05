import { testWithProject as test, expect } from '../electron-fixture';
import type { Page } from 'playwright/test';

// The top-left Canvas Toolbox covers the centre of a narrow window and the
// first block. Clicking there focuses its search field, which swallows Ctrl+G.
async function clickCanvasBackground(window: Page) {
  const canvas = window.locator('[aria-label="Story canvas"]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await window.mouse.click(box!.x + box!.width - 40, box!.y + box!.height - 40);
}

test.describe('go to label modal', () => {
  test('opens with Ctrl+G when canvas is active', async ({ window }) => {
    await clickCanvasBackground(window);

    await window.keyboard.press('Control+g');

    await expect(window.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('shows the fixture labels in the list', async ({ window }) => {
    await clickCanvasBackground(window);

    await window.keyboard.press('Control+g');
    await expect(window.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // The fixture project has labels 'start' and 'scene_two'
    const dialog = window.getByRole('dialog');
    await expect(dialog.getByText('start')).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('scene_two')).toBeVisible({ timeout: 5_000 });
  });

  test('filters results as the user types', async ({ window }) => {
    await clickCanvasBackground(window);

    await window.keyboard.press('Control+g');
    await expect(window.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    await window.keyboard.type('scene');

    const dialog = window.getByRole('dialog');
    // 'scene_two' should rank at the top of the fuzzy results
    await expect(dialog.getByText('scene_two')).toBeVisible({ timeout: 3_000 });
  });

  test('closes with Escape', async ({ window }) => {
    await clickCanvasBackground(window);

    await window.keyboard.press('Control+g');
    await expect(window.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    await window.keyboard.press('Escape');

    await expect(window.getByRole('dialog')).not.toBeVisible({ timeout: 3_000 });
  });
});
