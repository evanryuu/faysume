import { expect, test } from '@playwright/test'

for (const template of ['classic', 'modern', 'compact']) {
  test(`${template}: a four-line entry can use the page remainder with its company and dates`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await page.getByRole('button', { name: '空白创建', exact: true }).click()
    await page.getByLabel('姓名', { exact: true }).fill('Short Entry Example')
    await page.getByLabel('姓名', { exact: true }).blur()
    await page.getByLabel('简历模板').selectOption(template)
    await page.getByLabel('新增区块类型').selectOption('work')
    await page.getByRole('button', { name: '添加区块', exact: true }).click()
    await page.getByLabel('职位 / 项目 / 学位', { exact: true }).fill('Previous Role')
    const lines = (count: number) =>
      Array.from({ length: count }, (_, i) => `Earlier result ${i + 1}.`).join('\n')
    await page.getByRole('textbox', { name: '经历描述', exact: true }).fill(lines(18))
    await page.getByRole('textbox', { name: '经历描述', exact: true }).blur()
    await page.getByRole('button', { name: '添加经历条目', exact: true }).click()
    for (const [label, value] of [
      ['职位 / 项目 / 学位', 'Short Role'],
      ['公司 / 学校', 'Example Company'],
      ['开始时间', '2023.07'],
      ['结束时间', '2023.10'],
    ]) {
      await page.getByLabel(label, { exact: true }).nth(1).fill(value)
      await page.getByLabel(label, { exact: true }).nth(1).blur()
    }
    await page
      .getByRole('textbox', { name: '经历描述', exact: true })
      .nth(1)
      .fill(
        'SHORT-01 Internal tools.\nSHORT-02 Component library.\nSHORT-03 Private registry.\nSHORT-04 Code conventions.',
      )
    await page.getByRole('textbox', { name: '经历描述', exact: true }).nth(1).blur()
    await expect(page.getByTestId('resume-paper')).toContainText('SHORT-04')
    await page.emulateMedia({ media: 'print' })
    const fillerCount = await page.getByTestId('resume-paper').evaluate((paper) => {
      const heading = paper.querySelectorAll('.paper-item-heading')[1].getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(paper.querySelector('.paper-description')!).lineHeight)
      const pageHeight = ((297 - 14 * 2) * 96) / 25.4
      // Room for the heading, company and two body lines, but not all four.
      return 18 + Math.floor((pageHeight - heading.bottom - 2.5 * lineHeight) / lineHeight)
    })
    await page.emulateMedia({ media: 'screen' })
    await page.getByRole('textbox', { name: '经历描述', exact: true }).first().fill(lines(fillerCount))
    await page.getByRole('textbox', { name: '经历描述', exact: true }).first().blur()
    await expect(page.getByTestId('resume-paper')).toContainText(`Earlier result ${fillerCount}.`)
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      path: testInfo.outputPath(`${template}-short-entry.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    })
    const extracted = await page.evaluate(
      async (bytes) => {
        const modulePath = '/src/pdf.ts'
        const { readPdf } = await import(/* @vite-ignore */ modulePath)
        return (await readPdf(new File([new Uint8Array(bytes)], 'short.pdf', { type: 'application/pdf' })))
          .text as string
      },
      [...pdf],
    )
    const pages = extracted.split(/--- 第 \d+ 页 ---/).slice(1)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('Short Role')
    expect(pages[0]).toContain('Example Company')
    expect(pages[0]).toContain('SHORT-01')
    expect(pages[0]).toContain('SHORT-02')
    expect(pages[1]).toContain('SHORT-03')
    expect(pages[1]).toContain('SHORT-04')
  })

  test(`${template}: long experience flows across pages without orphaning its heading`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await page.getByRole('button', { name: '空白创建', exact: true }).click()
    await page.getByLabel('姓名', { exact: true }).fill('Pagination Example')
    await page.getByLabel('姓名', { exact: true }).blur()
    await page.getByLabel('简历模板').selectOption(template)
    await page.getByLabel('新增区块类型').selectOption('work')
    await page.getByRole('button', { name: '添加区块', exact: true }).click()
    const first = Array.from(
      { length: 18 },
      (_, i) => `FIRST-${String(i + 1).padStart(2, '0')} Delivered a documented project outcome.`,
    ).join('\n')
    const second = Array.from(
      { length: 28 },
      (_, i) => `SECOND-${String(i + 1).padStart(2, '0')} Led a cross-functional product initiative.`,
    ).join('\n')
    await page.getByLabel('职位 / 项目 / 学位', { exact: true }).fill('First Role')
    await page.getByRole('textbox', { name: '经历描述', exact: true }).fill(first)
    await page.getByRole('textbox', { name: '经历描述', exact: true }).blur()
    await page.getByRole('button', { name: '添加经历条目', exact: true }).click()
    await page.getByLabel('职位 / 项目 / 学位', { exact: true }).nth(1).fill('Second Role')
    await page.getByRole('textbox', { name: '经历描述', exact: true }).nth(1).fill(second)
    await page.getByRole('textbox', { name: '经历描述', exact: true }).nth(1).blur()
    await expect(page.getByTestId('resume-paper')).toContainText('SECOND-28')
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      path: testInfo.outputPath(`${template}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    })
    const extracted = await page.evaluate(
      async (bytes) => {
        const modulePath = '/src/pdf.ts'
        const { readPdf } = await import(/* @vite-ignore */ modulePath)
        return (
          await readPdf(new File([new Uint8Array(bytes)], 'pagination.pdf', { type: 'application/pdf' }))
        ).text as string
      },
      [...pdf],
    )
    const pages = extracted.split(/--- 第 \d+ 页 ---/).slice(1)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('Second Role')
    expect(pages[0]).toContain('SECOND-01')
    expect(pages[1]).toContain('SECOND-28')
    for (const prefix of ['FIRST', 'SECOND']) {
      const count = prefix === 'FIRST' ? 18 : 28
      for (let i = 1; i <= count; i++) {
        const marker = `${prefix}-${String(i).padStart(2, '0')}`
        expect(extracted.split(marker)).toHaveLength(2)
      }
    }

    // Leave space for the next heading and only one line: they must move together.
    const additionalLines = await page.getByTestId('resume-paper').evaluate((paper) => {
      const heading = paper.querySelectorAll('.paper-item-heading')[1].getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(paper.querySelector('.paper-description')!).lineHeight)
      const pageHeight = ((297 - 14 * 2) * 96) / 25.4
      return Math.max(0, Math.floor((pageHeight - heading.bottom - lineHeight) / lineHeight))
    })
    await page.emulateMedia({ media: 'screen' })
    const filler = Array.from({ length: additionalLines }, (_, i) => `Additional result ${i + 1}.`).join('\n')
    await page.getByRole('textbox', { name: '经历描述', exact: true }).first().fill(`${first}\n${filler}`)
    await page.getByRole('textbox', { name: '经历描述', exact: true }).first().blur()
    await expect(page.getByTestId('resume-paper')).toContainText(`Additional result ${additionalLines}.`)
    await page.emulateMedia({ media: 'print' })
    const boundaryPdf = await page.pdf({
      path: testInfo.outputPath(`${template}-heading-boundary.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    })
    const boundaryText = await page.evaluate(
      async (bytes) => {
        const modulePath = '/src/pdf.ts'
        const { readPdf } = await import(/* @vite-ignore */ modulePath)
        return (await readPdf(new File([new Uint8Array(bytes)], 'boundary.pdf', { type: 'application/pdf' })))
          .text as string
      },
      [...boundaryPdf],
    )
    const boundaryPages = boundaryText.split(/--- 第 \d+ 页 ---/).slice(1)
    expect(boundaryPages[0]).not.toContain('Second Role')
    expect(boundaryPages[1]).toContain('Second Role')
    expect(boundaryPages[1]).toContain('SECOND-01')
    expect(boundaryPages[1]).toContain('SECOND-02')
    expect(boundaryPages[1]).toContain('SECOND-03')
  })
}
