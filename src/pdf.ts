import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ImageInput } from './components/ui'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfImport {
  name: string
  text: string
  images: ImageInput[]
  imageOnlyPages: number[]
  pageCount: number
}

/** Local-only parsing. The caller decides whether and when to send content to AI. */
export async function readPdf(
  file: File,
  { renderPages = false, signal }: { renderPages?: boolean; signal?: AbortSignal } = {},
): Promise<PdfImport> {
  if (!/\.pdf$/i.test(file.name)) throw new Error('请选择 PDF 文件。')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('请选择非空且不超过 10MB 的 PDF。')
  signal?.throwIfAborted()
  const data = new Uint8Array(await file.arrayBuffer())
  signal?.throwIfAborted()
  const task = getDocument({
    data,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    stopAtErrors: true,
  })
  const abort = () => {
    void task.destroy()
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 5) throw new Error('PDF 最多支持 5 页，请拆分后再上传。')
    const result: PdfImport = {
      name: file.name,
      text: '',
      images: [],
      imageOnlyPages: [],
      pageCount: pdf.numPages,
    }
    const texts: string[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted()
      const page = await pdf.getPage(number)
      try {
        const content = await page.getTextContent()
        const text = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
          .join('')
          // Some PDF font maps encode ordinary Chinese glyphs as Kangxi radicals.
          .replace(/[\u2f00-\u2fdf]/g, (character) => character.normalize('NFKC'))
          .trim()
        // A short text layer can be just a page number on an otherwise scanned page.
        if (text.replace(/\s/g, '').length < 30) result.imageOnlyPages.push(number)
        texts.push(`--- 第 ${number} 页 ---\n${text}`)
        if (texts.join('\n').length > 100000) throw new Error('PDF 文字超过 10 万字，请拆分后再上传。')
        if (renderPages) {
          const size = page.getViewport({ scale: 1 })
          const scale = Math.min(2, 1800 / Math.max(size.width, size.height))
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          try {
            await page.render({ canvas, viewport, background: '#ffffff' }).promise
            signal?.throwIfAborted()
            result.images.push({
              id: crypto.randomUUID(),
              name: `${file.name} · 第 ${number} 页`,
              dataUrl: canvas.toDataURL('image/jpeg', 0.9),
            })
          } finally {
            canvas.width = canvas.height = 0
          }
        }
      } finally {
        page.cleanup()
      }
    }
    signal?.throwIfAborted()
    result.text = texts.join('\n\n')
    return result
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error) {
      if (error.name === 'PasswordException') throw new Error('此 PDF 已加密，请先解除密码保护后再上传。')
      if (error.name === 'InvalidPDFException' || error.name === 'UnknownErrorException')
        throw new Error('无法读取此 PDF，文件可能已损坏。请重新导出后再上传。')
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    await task.destroy()
  }
}
