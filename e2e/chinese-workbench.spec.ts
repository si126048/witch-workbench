import { testWithProject as test, expect, openBlockInEditor } from './electron-fixture';

test.use({ uiLanguage: 'zh-CN' });

test('shipping locale translates renderer controls and native menus', async ({ window, electronApp }) => {
  await expect(window.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await window.getByRole('button', { name: '设置', exact: true }).click();
  await expect(window.getByText('编辑器外观', { exact: true })).toBeVisible();
  await expect(window.getByText('画布与鼠标', { exact: true })).toBeVisible();
  await expect(window.getByText('字体', { exact: true })).toBeVisible();
  await expect(window.getByText('Editor Appearance', { exact: true })).toHaveCount(0);
  const menus = await electronApp.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map(item => item.label));
  expect(menus).toEqual(expect.arrayContaining(['文件', '编辑', '视图', '帮助']));
});

test('canvas controls accept real clicks at normal and narrow widths', async ({ window }) => {
  for (const width of [1280, 960]) {
    await window.setViewportSize({ width, height: 800 });
    for (const name of ['流程画布', '选项画布', '卡片画布', '项目画布']) {
      const button = window.getByRole('group', { name: '切换画布' }).getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  }
});

test('Monaco context menu uses the bundled Chinese language pack', async ({ window }) => {
  await openBlockInEditor(window);
  const editor = window.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click({ button: 'right' });
  await expect(window.getByRole('menuitem', { name: /复制/ }).first()).toBeVisible();
  await window.keyboard.press('Escape');
});
