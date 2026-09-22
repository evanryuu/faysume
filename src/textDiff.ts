import { diffChars } from 'diff'

export function diffText(before: string, after: string) {
  // Bound work for very large rewrites so reviewing a suggestion cannot freeze the editor.
  return diffChars(before, after, { timeout: 50, maxEditLength: 2000 })
}
