import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, LoaderCircle, ArrowUp, ArrowDown, ImagePlus, Trash2 } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from './ui/dialog'
export type Notify = (message: string, kind?: 'error' | 'success') => void
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。'

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={`modal ${wide ? 'wide' : ''}`}
        showCloseButton={false}
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (returnFocus?.isConnected) returnFocus.focus()
        }}
      >
        <div className="modal-heading">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" type="button" className="icon-button" aria-label="关闭对话框">
              <X size={20} />
            </Button>
          </DialogClose>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  value,
  onCommit,
  multiline = false,
  placeholder = '',
  type = 'text',
}: {
  label: string
  value: string
  onCommit: (value: string, expectedValue: string) => void
  multiline?: boolean
  placeholder?: string
  type?: string
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const baseline = useRef(value)
  const dirty = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  const props = {
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true
      setDraft(e.target.value)
    },
    onFocus: () => {
      focused.current = true
      baseline.current = value
      dirty.current = false
    },
    onBlur: () => {
      focused.current = false
      if (dirty.current && draft !== baseline.current) {
        onCommit(draft, baseline.current)
        if (value !== baseline.current) setDraft(value)
      } else setDraft(value)
      dirty.current = false
    },
  }
  return (
    <label className={`field ${multiline ? 'full' : ''}`}>
      <span>{label}</span>
      {multiline ? <Textarea {...props} rows={5} /> : <Input {...props} type={type} />}
    </label>
  )
}

export function Busy({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <div className="busy">
      <LoaderCircle size={19} className="spin" />
      <span>{label}</span>
      <Button variant="ghost" size="layout" type="button" className="text-button" onClick={onCancel}>
        取消
      </Button>
    </div>
  )
}
export interface ImageInput {
  id: string
  name: string
  dataUrl: string
}
export async function readImages(files: File[]): Promise<ImageInput[]> {
  if (files.length > 5) throw new Error('一次最多上传 5 张截图。')
  return Promise.all(
    files.map(
      (file) =>
        new Promise<ImageInput>((resolve, reject) => {
          if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 10 * 1024 * 1024
          ) {
            reject(new Error('请选择 10MB 以内的 PNG、JPEG 或 WebP 图片。'))
            return
          }
          const reader = new FileReader()
          reader.onload = () =>
            resolve({ id: crypto.randomUUID(), name: file.name, dataUrl: String(reader.result) })
          reader.onerror = () => reject(new Error('读取图片失败，请重试。'))
          reader.readAsDataURL(file)
        }),
    ),
  )
}

export function ImagePicker({
  images,
  onChange,
  notify,
  disabled = false,
  onFiles,
}: {
  images: ImageInput[]
  onChange: (images: ImageInput[]) => void
  notify: Notify
  disabled?: boolean
  onFiles?: (files: File[]) => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const imagesRef = useRef(images),
    mounted = useRef(true)
  imagesRef.current = images
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const commit = (next: ImageInput[]) => {
    imagesRef.current = next
    onChange(next)
  }
  const append = async (files: File[]) => {
    if (disabled) return
    if (onFiles) return onFiles(files)
    try {
      const additions = await readImages(files)
      if (!mounted.current) return
      if (imagesRef.current.length + additions.length > 5)
        throw new Error('最多 5 张截图，请先移除多余图片。')
      commit([...imagesRef.current, ...additions])
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const move = (index: number, by: number) => {
    const next = [...imagesRef.current]
    const dest = index + by
    if (dest < 0 || dest >= next.length) return
    ;[next[index], next[dest]] = [next[dest], next[index]]
    commit(next)
  }
  return (
    <div
      onPaste={(event) => {
        const files = [...event.clipboardData.files]
        if (files.length) {
          event.preventDefault()
          void append(files)
        }
      }}
    >
      <Button
        variant="ghost"
        size="layout"
        type="button"
        className="dropzone"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void append([...e.dataTransfer.files])
        }}
      >
        <span className="upload-icon">
          <ImagePlus size={25} />
        </span>
        <strong>{onFiles ? '选择或拖入 PDF、图片，也可粘贴截图' : '选择、拖入或粘贴截图'}</strong>
        <span>
          {onFiles
            ? 'PDF / PNG / JPG / WebP · 每个文件不超过 10MB'
            : 'PNG / JPG / WebP · 最多 5 张，每张 10MB'}
        </span>
      </Button>
      <Input
        ref={input}
        className="sr-only"
        aria-label={onFiles ? '上传简历 PDF 或图片' : '上传截图文件'}
        type="file"
        accept={
          onFiles ? '.pdf,application/pdf,image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp'
        }
        multiple
        disabled={disabled}
        onChange={(e) => {
          void append([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {images.length > 0 && (
        <div className="image-strip">
          {images.map((image, index) => (
            <div className="image-tile" key={image.id}>
              <img src={image.dataUrl} alt={`第 ${index + 1} 页：${image.name}`} />
              <span>
                {index + 1}. {image.name}
              </span>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`上移第 ${index + 1} 页`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`下移第 ${index + 1} 页`}
                  disabled={disabled || index === images.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`移除第 ${index + 1} 页`}
                  disabled={disabled}
                  onClick={() => commit(imagesRef.current.filter((i) => i.id !== image.id))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function downloadJson(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
