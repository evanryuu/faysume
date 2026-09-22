import { expect, test } from '@playwright/test'

test('API key survives reload and reopening, is excluded from backups, and can be cleared', async ({
  page,
  context,
}) => {
  await page.goto('/settings')
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('模型名称').fill('test-model')
  await page.getByLabel('API Key', { exact: true }).fill('test-persistent-key')
  await page.reload()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('test-persistent-key')

  const reopened = await context.newPage()
  await reopened.goto('/settings')
  await expect(reopened.getByLabel('API Key', { exact: true })).toHaveValue('test-persistent-key')
  const downloadPromise = reopened.waitForEvent('download')
  await reopened.getByRole('button', { name: '导出全部备份' }).click()
  const stream = await (await downloadPromise).createReadStream()
  let backup = ''
  for await (const chunk of stream!) backup += chunk.toString()
  expect(backup).not.toContain('test-persistent-key')
  expect(backup).not.toContain('apiKey')

  await reopened.getByRole('button', { name: '清除凭证', exact: true }).click()
  await reopened.reload()
  await expect(reopened.getByLabel('API Key', { exact: true })).toHaveValue('')
  await expect(reopened.getByLabel('Base URL', { exact: true })).toHaveValue('https://provider.test/v1')
  await expect(reopened.getByLabel('模型名称')).toHaveValue('test-model')
  expect(await reopened.evaluate(() => localStorage.getItem('resume-studio-ai'))).not.toContain(
    'test-persistent-key',
  )
  await page.reload()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
})

test('old connection settings without an API key still load', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'resume-studio-ai',
      JSON.stringify({ baseUrl: 'https://provider.test/v1', model: 'old-model', vision: true }),
    )
  })
  await page.goto('/settings')
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('模型名称')).toHaveValue('old-model')
  await expect(page.getByLabel('这个模型支持图片输入')).toBeChecked()
})
