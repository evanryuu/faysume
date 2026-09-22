import { expect, test } from '@playwright/test'

test('retained wording stays neutral in Chinese summaries and multiline skill edits', async ({
  page,
}, testInfo) => {
  const examples = [
    {
      before: '4年经验前端开发，曾任小组长，数个开源项目Contributor',
      after:
        '4 年经验的前端/全栈开发，曾任项目前端小组长，多个开源项目 Contributor，具备 Next.js + Go/Node.js 全栈交付、云服务部署与 AI API 集成经验。',
    },
    {
      before:
        '熟练使用Next.js进行SSR项目开发与部署；\n这个还是可以的；\n熟练运用AI辅助日常开发，具备调用AI API开发智能功能的经验；',
      after:
        '熟练使用 Next.js 进行 SSR 项目开发与部署；\n熟练运用 AI 辅助日常开发，具备调用 AI API 开发智能功能的经验；',
    },
  ]
  await page.goto('/')
  const id = await page.evaluate(async (examples) => {
    const domainPath = '/src/domain.ts'
    const dbPath = '/src/db.ts'
    const { createResume, uid } = await import(/* @vite-ignore */ domainPath)
    const { db } = await import(/* @vite-ignore */ dbPath)
    const resume = createResume('文字差异示例')
    resume.suggestions = examples.map((example, index) => {
      const field = index === 0 ? 'headline' : 'summary'
      resume.content[field] = example.before
      return {
        ...example,
        id: uid(),
        target: { kind: 'profile', field },
        reason: '对照实际文字改动',
        evidence: ['resume'],
        question: '',
        requiresConfirmation: false,
        confirmed: false,
        status: 'pending',
      }
    })
    await db.resumes.add(resume)
    return resume.id
  }, examples)
  await page.goto(`/resumes/${id}?tab=ai`)
  const diffs = page.getByRole('group', { name: '修改对比' })
  await expect(diffs).toHaveCount(2)
  await expect(diffs.nth(0).locator('del')).toHaveText('数')
  await expect(diffs.nth(1).locator('del')).toHaveText('这个还是可以的；')
  for (const [index, example] of examples.entries()) {
    expect(await diffs.nth(index).locator('.before p').textContent()).toBe(example.before)
    expect(await diffs.nth(index).locator('.after p').textContent()).toBe(example.after)
    const shared = diffs.nth(index).locator('.diff-unchanged').first()
    await expect(shared).toHaveCSS('color', 'rgb(55, 65, 81)')
    await expect(shared).toHaveCSS('text-decoration-line', 'none')
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const index of [0, 1]) {
      await diffs.nth(index).evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await diffs.nth(index).screenshot({ path: testInfo.outputPath(`diff-${index}-${width}.png`) })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})
