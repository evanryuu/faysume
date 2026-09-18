import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applySuggestions, cloneResume, createResume } from '../src/domain'
import {
  createDatabase,
  db,
  deleteResume,
  exportBackup,
  importBackup,
  insertResume,
  mutateResume,
  saveResume,
} from '../src/db'
import type { Source } from '../src/types'
import { emptyWorkflow, workflowSnapshot } from '../src/workflow'

beforeEach(async () => {
  await db.open()
  await Promise.all([db.resumes.clear(), db.materials.clear(), db.sources.clear()])
})
afterEach(async () => {
  await db.delete()
})
function source(resumeId: string): Source {
  return { id: 'source-1', resumeId, name: '截图.png', dataUrl: 'data:image/png;base64,aGVsbG8=' }
}

describe('local repository', () => {
  it('persists conversation and approval state; backup restores a draft without old approvals', async () => {
    const doc = createResume('对话测试')
    doc.workflow = {
      ...emptyWorkflow(),
      intent: '强调前端贡献',
      confirmed: true,
      plan: { summary: '精简表达', directions: ['强调贡献'], questions: [], searchQueries: [] },
    }
    doc.workflow.inputSnapshot = workflowSnapshot(doc, [])
    doc.conversation = {
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: '强调前端贡献' }] }],
      snapshot: workflowSnapshot(doc, []),
      handledCalls: [],
    }
    await insertResume(doc)
    db.close()
    await db.open()
    expect((await db.resumes.get(doc.id))?.conversation?.messages).toHaveLength(1)
    await mutateResume(doc.id, (d) => ({ ...d, template: 'modern' }))
    expect((await db.resumes.get(doc.id))?.workflow?.confirmed).toBe(true)
    await importBackup(await exportBackup())
    const restored = (await db.resumes.toArray()).find((d) => d.id !== doc.id)!
    expect(restored.workflow).toMatchObject({ intent: '强调前端贡献', plan: null, confirmed: false })
    expect(restored.conversation).toBeUndefined()
    await mutateResume(doc.id, (d) => ({ ...d, targetRole: '不同岗位' }))
    expect((await db.resumes.get(doc.id))?.workflow?.confirmed).toBe(false)
  })
  it('persists documents and history after closing and reopening the database', async () => {
    const doc = createResume('保存测试')
    doc.suggestions = [
      {
        id: 's1',
        target: { kind: 'profile', field: 'headline' },
        before: '',
        after: '设计师',
        reason: '素材',
        evidence: [],
        question: '',
        requiresConfirmation: false,
        confirmed: false,
        status: 'pending',
      },
    ]
    await insertResume(doc)
    await mutateResume(doc.id, (d) => applySuggestions(d, ['s1']))
    db.close()
    await db.open()
    const saved = await db.resumes.get(doc.id)
    expect(saved?.history).toHaveLength(1)
    expect(saved?.revision).toBe(1)
    const isolated = createDatabase('isolated-test')
    expect(await isolated.resumes.count()).toBe(0)
    await isolated.delete()
  })
  it('serializes concurrent field edits using the freshest record', async () => {
    const doc = createResume()
    await insertResume(doc)
    await Promise.all([
      mutateResume(doc.id, (d) => ({ ...d, content: { ...d.content, name: '姓名' } })),
      mutateResume(doc.id, (d) => ({ ...d, content: { ...d.content, headline: '岗位' } })),
    ])
    expect(await db.resumes.get(doc.id)).toMatchObject({
      revision: 2,
      content: { name: '姓名', headline: '岗位' },
    })
    await expect(saveResume({ ...doc, name: '旧快照' }, 0)).rejects.toThrow()
    expect((await db.resumes.get(doc.id))?.name).toBe(doc.name)
    await expect(mutateResume(doc.id, (d) => ({ ...d, id: 'different' }))).rejects.toThrow()
    expect(await db.resumes.count()).toBe(1)
  })
  it('rolls back failed mutation and validates records before insertion', async () => {
    const doc = createResume()
    await insertResume(doc)
    await expect(
      mutateResume(doc.id, (d) => {
        d.content.name = '不应保存'
        throw new Error('failed')
      }),
    ).rejects.toThrow('failed')
    expect((await db.resumes.get(doc.id))?.content.name).toBe('')
    await expect(insertResume({ ...createResume(), revision: -1 })).rejects.toThrow()
    const invalid = createResume()
    invalid.sourceIds = ['missing']
    await expect(insertResume(invalid)).rejects.toThrow()
    expect(await db.resumes.count()).toBe(1)
  })
  it('retains shared screenshots until the last referencing version is deleted', async () => {
    const doc = createResume()
    doc.sourceIds = ['source-1']
    await insertResume(doc, [source(doc.id)])
    const copy = cloneResume(doc)
    await insertResume(copy)
    await deleteResume(doc.id)
    expect(await db.sources.count()).toBe(1)
    expect((await db.sources.get('source-1'))?.resumeId).toBe(copy.id)
    await deleteResume(copy.id)
    expect(await db.sources.count()).toBe(0)
  })
  it('reassigns or deletes original images when a version detaches its source links', async () => {
    const doc = createResume()
    doc.sourceIds = ['source-1']
    await insertResume(doc, [source(doc.id)])
    const copy = cloneResume(doc)
    await insertResume(copy)
    await mutateResume(doc.id, (d) => ({ ...d, sourceIds: [] }))
    expect((await db.sources.get('source-1'))?.resumeId).toBe(copy.id)
    await importBackup(await exportBackup())
    await mutateResume(copy.id, (d) => ({ ...d, sourceIds: [] }))
    expect(await db.sources.get('source-1')).toBeUndefined()
  })
  it('rolls back original images if document insertion fails, and accepts fresh snapshot saves', async () => {
    const doc = createResume()
    await insertResume(doc)
    await expect(insertResume({ ...doc, sourceIds: ['source-1'] }, [source(doc.id)])).rejects.toThrow()
    expect(await db.sources.count()).toBe(0)
    await saveResume({ ...doc, name: '新名称' }, 0)
    expect(await db.resumes.get(doc.id)).toMatchObject({ name: '新名称', revision: 1 })
  })
  it('exports fixed-version business data only and imports additively with remapped links', async () => {
    const doc = createResume()
    doc.sourceIds = ['source-1']
    await insertResume(doc, [source(doc.id)])
    await db.materials.add({
      id: 'm1',
      title: '素材',
      content: '事实',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })
    const json = await exportBackup()
    const backup = JSON.parse(json)
    expect(Object.keys(backup).sort()).toEqual(['materials', 'resumes', 'sources', 'version'])
    expect(backup.version).toBe(1)
    await importBackup(json)
    await importBackup(json)
    expect(await db.resumes.count()).toBe(3)
    expect(await db.sources.count()).toBe(3)
    expect(await db.materials.count()).toBe(3)
    const imported = (await db.resumes.toArray()).filter((d) => d.id !== doc.id)
    expect(new Set(imported.flatMap((d) => d.sourceIds)).size).toBe(2)
    for (const d of imported) expect((await db.sources.get(d.sourceIds[0]))?.resumeId).toBe(d.id)
    expect(await db.resumes.get(doc.id)).toEqual(doc)
  })
  it('rejects malformed history, duplicate IDs, dangling links and malicious image URLs atomically', async () => {
    const doc = createResume()
    doc.sourceIds = ['source-1']
    await insertResume(doc, [source(doc.id)])
    const backup = JSON.parse(await exportBackup())
    for (const broken of [
      { ...backup, resumes: [doc, doc] },
      { ...backup, sources: [] },
      { ...backup, sources: [{ ...source(doc.id), dataUrl: 'javascript:alert(1)' }] },
      { ...backup, resumes: [{ ...doc, history: [{ id: 'h1' }] }] },
      { ...backup, settings: { apiKey: 'must-not-import' } },
    ]) {
      await expect(importBackup(JSON.stringify(broken))).rejects.toThrow()
      expect(await db.resumes.count()).toBe(1)
      expect(await db.sources.count()).toBe(1)
    }
  })
})
