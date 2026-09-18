import { beforeEach, expect, it, vi } from 'vitest'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: load, GlobalWorkerOptions: {} }))
import { readPdf } from '../src/pdf'

beforeEach(() => load.mockReset())
const file = () => new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })

it('rejects the wrong format, empty files and oversized PDFs before loading a worker', async () => {
  await expect(readPdf(new File(['text'], 'resume.txt'))).rejects.toThrow('PDF 文件')
  await expect(readPdf(new File([], 'resume.pdf'))).rejects.toThrow('非空')
  await expect(readPdf(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'resume.pdf'))).rejects.toThrow(
    '10MB',
  )
  expect(load).not.toHaveBeenCalled()
})

it('keeps page order and flags image-only pages without inventing text', async () => {
  const cleanup = vi.fn()
  const destroy = vi.fn()
  const texts = ['A complete first page of resume facts with enough selectable text.', '']
  load.mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (page: number) => ({
        getTextContent: async () => ({ items: [{ str: texts[page - 1], hasEOL: true }] }),
        cleanup,
      }),
    }),
    destroy,
  })
  const result = await readPdf(file())
  expect(result.text).toBe(`--- 第 1 页 ---\n${texts[0]}\n\n--- 第 2 页 ---\n`)
  expect(result.imageOnlyPages).toEqual([2])
  expect(result.images).toEqual([])
  expect(cleanup).toHaveBeenCalledTimes(2)
  expect(destroy).toHaveBeenCalledOnce()
})

it('rejects too many pages as a whole and releases the document', async () => {
  const getPage = vi.fn(),
    destroy = vi.fn()
  load.mockReturnValue({ promise: Promise.resolve({ numPages: 6, getPage }), destroy })
  await expect(readPdf(file())).rejects.toThrow('最多支持 5 页')
  expect(getPage).not.toHaveBeenCalled()
  expect(destroy).toHaveBeenCalledOnce()
})

it('does not insert spaces inside Chinese words or remove spaces supplied by the PDF', async () => {
  load.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            { str: '负责', hasEOL: false },
            { str: '⽀', hasEOL: false },
            { str: '付平台', hasEOL: true },
            { str: 'Software', hasEOL: false },
            { str: ' ', hasEOL: false },
            { str: 'engineer', hasEOL: true },
          ],
        }),
        cleanup: vi.fn(),
      }),
    }),
    destroy: vi.fn(),
  })
  const result = await readPdf(file())
  expect(result.text).toBe('--- 第 1 页 ---\n负责支付平台\nSoftware engineer')
})

it('rejects oversized extracted text without returning partial results', async () => {
  const destroy = vi.fn(),
    cleanup = vi.fn()
  load.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: [{ str: 'x'.repeat(100001), hasEOL: false }] }),
        cleanup,
      }),
    }),
    destroy,
  })
  await expect(readPdf(file())).rejects.toThrow('10 万字')
  expect(cleanup).toHaveBeenCalledOnce()
  expect(destroy).toHaveBeenCalledOnce()
})

it('cancels loading and does not return a partial import', async () => {
  const controller = new AbortController()
  let rejectLoad!: (error: Error) => void
  const promise = new Promise((_, reject) => {
    rejectLoad = reject
  })
  const destroy = vi.fn(() => rejectLoad(new Error('Worker destroyed')))
  load.mockReturnValue({ promise, destroy })
  const result = readPdf(file(), { signal: controller.signal })
  const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
  controller.abort()
  await assertion
  expect(destroy).toHaveBeenCalled()
})
