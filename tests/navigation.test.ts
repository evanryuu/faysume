import { describe, expect, it } from 'vitest'
import { editorSearchSchema, resumeListSearchSchema } from '../src/navigation'

describe('URL state validation', () => {
  it('defaults to content editing for a plain resume URL', () => {
    expect(editorSearchSchema.parse({})).toEqual({ tab: 'content', preview: false })
  })
  it('accepts valid editor tabs and preview', () => {
    for (const tab of ['content', 'ai', 'sources', 'history']) {
      expect(editorSearchSchema.parse({ tab, preview: true })).toEqual({ tab, preview: true })
    }
  })
  it('recovers from malformed URL values without an error page', () => {
    expect(
      editorSearchSchema.parse({ tab: 'unknown', preview: 'no', accessToken: 'not-a-route-field' }),
    ).toEqual({ tab: 'content', preview: false })
    expect(resumeListSearchSchema.parse({ q: [], apiKey: 'not-a-route-field' })).toEqual({ q: '' })
    expect(resumeListSearchSchema.parse({ q: 'x'.repeat(201) })).toEqual({ q: '' })
    expect(resumeListSearchSchema.parse({ q: '前端' })).toEqual({ q: '前端' })
  })
})
