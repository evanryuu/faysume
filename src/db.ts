import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import { documentSchema, uid } from './domain'
import { reviewContext } from './workflow'
import type { Material, ResumeDocument, Source } from './types'

export function createDatabase(name = 'resume-studio') {
  const database = new Dexie(name) as Dexie & {
    resumes: EntityTable<ResumeDocument, 'id'>
    materials: EntityTable<Material, 'id'>
    sources: EntityTable<Source, 'id'>
  }
  database
    .version(1)
    .stores({ resumes: 'id, updatedAt', materials: 'id, updatedAt', sources: 'id, resumeId' })
  return database
}
export const db = createDatabase()
const idSchema = z.string().min(1).max(200)
const timestamp = z.iso.datetime()
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_BACKUP_BYTES = 150 * 1024 * 1024
const materialSchema = z
  .object({
    id: idSchema,
    title: z.string().max(200_000),
    content: z.string().max(1_000_000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
const imageSchema = z
  .string()
  .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 100)
  .refine((value) => {
    const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
    if (!match || match[1].length % 4 !== 0) return false
    const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0
    return (match[1].length / 4) * 3 - padding <= MAX_IMAGE_BYTES
  }, '原图必须是 10 MB 以内的 PNG、JPEG、WebP 或 GIF 图片')
const sourceSchema = z
  .object({ id: idSchema, resumeId: idSchema, name: z.string().max(10_000), dataUrl: imageSchema })
  .strict()
const backupSchema = z
  .object({
    version: z.literal(1),
    resumes: z.array(documentSchema).max(10000),
    materials: z.array(materialSchema).max(10000),
    sources: z.array(sourceSchema).max(50000),
  })
  .strict()

async function ensureSourcesExist(doc: ResumeDocument): Promise<void> {
  const sources = await db.sources.bulkGet(doc.sourceIds)
  if (sources.some((s) => !s)) throw new Error('简历关联的原始图片不存在')
}
export async function insertResume(doc: ResumeDocument, sources: Source[] = []): Promise<void> {
  const parsed = documentSchema.parse(doc)
  const checkedSources = sources.map((s) => sourceSchema.parse(s))
  if (checkedSources.some((s) => s.resumeId !== doc.id || !doc.sourceIds.includes(s.id)))
    throw new Error('原始图片与简历关联不匹配')
  await db.transaction('rw', db.resumes, db.sources, async () => {
    await db.sources.bulkAdd(checkedSources)
    await ensureSourcesExist(parsed)
    await db.resumes.add(parsed)
  })
}
export async function mutateResume(
  id: string,
  mutator: (doc: ResumeDocument) => ResumeDocument,
): Promise<void> {
  await db.transaction('rw', db.resumes, db.sources, async () => {
    const current = await db.resumes.get(id)
    if (!current) throw new Error('简历不存在，可能已在其他页面删除')
    const next = mutator(structuredClone(current))
    if (
      next.workflow &&
      next.workflow.inputSnapshot === current.workflow?.inputSnapshot &&
      (reviewContext(current) !== reviewContext(next) ||
        JSON.stringify(current.content) !== JSON.stringify(next.content) ||
        current.extractionReviewed !== next.extractionReviewed)
    ) {
      next.workflow.confirmed = false
    }
    if (next.id !== id) throw new Error('不能修改简历 ID')
    const parsed = documentSchema.parse({
      ...next,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })
    await ensureSourcesExist(parsed)
    await db.resumes.put(parsed)
    await reconcileSources(current.sourceIds.filter((sourceId) => !parsed.sourceIds.includes(sourceId)))
  })
}
export async function saveResume(doc: ResumeDocument, expectedRevision: number): Promise<void> {
  await mutateResume(doc.id, (current) => {
    if (current.revision !== expectedRevision) throw new Error('简历已更新，请刷新后重试，避免覆盖其他修改')
    return doc
  })
}
async function reconcileSources(sourceIds: Iterable<string>): Promise<void> {
  const ids = [...sourceIds]
  if (!ids.length) return
  const remaining = await db.resumes.toArray()
  for (const sourceId of ids) {
    const owner = remaining.find((d) => d.sourceIds.includes(sourceId))
    if (!owner) await db.sources.delete(sourceId)
    else await db.sources.update(sourceId, { resumeId: owner.id })
  }
}
export async function deleteResume(id: string): Promise<void> {
  await db.transaction('rw', db.resumes, db.sources, async () => {
    const doc = await db.resumes.get(id)
    if (!doc) return
    await db.resumes.delete(id)
    // Rehome shared sources so source.resumeId always names a surviving owner.
    const owned = await db.sources.where('resumeId').equals(id).toArray()
    const sourceIds = new Set([...doc.sourceIds, ...owned.map((s) => s.id)])
    await reconcileSources(sourceIds)
  })
}
export async function exportBackup(): Promise<string> {
  return db.transaction('r', db.resumes, db.materials, db.sources, async () => {
    const [resumes, materials, sources] = await Promise.all([
      db.resumes.toArray(),
      db.materials.toArray(),
      db.sources.toArray(),
    ])
    // Explicit allowlist: API settings and credentials are never included.
    return JSON.stringify({ version: 1, resumes, materials, sources }, null, 2)
  })
}
/** Import is additive: every imported record receives a new ID. Existing records
 * are never overwritten; screenshot links and source ownership are remapped in
 * one transaction. Content item IDs remain document-local, preserving history.
 * Re-importing the same backup deliberately creates another independent copy. */
export async function importBackup(json: string): Promise<void> {
  if (json.length > MAX_BACKUP_BYTES || new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES)
    throw new Error('备份文件超过 150 MB 限制')
  const backup = backupSchema.parse(JSON.parse(json))
  const assertUnique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error('备份中存在重复 ID')
  }
  assertUnique(backup.resumes.map((d) => d.id))
  assertUnique(backup.materials.map((m) => m.id))
  assertUnique(backup.sources.map((s) => s.id))
  const resumesById = new Map(backup.resumes.map((d) => [d.id, d]))
  const sourcesById = new Map(backup.sources.map((s) => [s.id, s]))
  for (const doc of backup.resumes)
    for (const sourceId of doc.sourceIds)
      if (!sourcesById.has(sourceId)) throw new Error('备份中的图片关联缺失')
  for (const source of backup.sources) {
    const owner = resumesById.get(source.resumeId)
    if (!owner || !owner.sourceIds.includes(source.id)) throw new Error('备份中的原图没有有效归属')
  }
  const resumeIds = new Map(backup.resumes.map((d) => [d.id, uid()]))
  const sourceIds = new Map(backup.sources.map((s) => [s.id, uid()]))
  const resumes = backup.resumes.map((d) => ({
    ...d,
    workflow: d.workflow
      ? { ...d.workflow, materialIds: [], plan: null, confirmed: false, inputSnapshot: '', research: [] }
      : undefined,
    conversation: undefined,
    id: resumeIds.get(d.id)!,
    revision: 0,
    sourceIds: d.sourceIds.map((id) => sourceIds.get(id)!),
  }))
  const sources = backup.sources.map((s) => ({
    ...s,
    id: sourceIds.get(s.id)!,
    resumeId: resumeIds.get(s.resumeId)!,
  }))
  const materials = backup.materials.map((m) => ({ ...m, id: uid() }))
  await db.transaction('rw', db.resumes, db.materials, db.sources, async () => {
    await db.resumes.bulkAdd(resumes)
    await db.materials.bulkAdd(materials)
    await db.sources.bulkAdd(sources)
  })
}
