export type ProfileField = 'name' | 'headline' | 'email' | 'phone' | 'location' | 'website' | 'summary'
export type ItemField = 'title' | 'organization' | 'location' | 'startDate' | 'endDate' | 'description'
export type SectionKind = 'work' | 'project' | 'education' | 'skills' | 'other'
export interface ResumeItem {
  layout?: 'text' | 'entry'
  id: string
  title: string
  organization: string
  location: string
  startDate: string
  endDate: string
  description: string
}
export interface ResumeSection {
  id: string
  title: string
  kind: SectionKind
  items: ResumeItem[]
}
export interface ResumeContent {
  name: string
  headline: string
  email: string
  phone: string
  location: string
  website: string
  summary: string
  sections: ResumeSection[]
}
export type Target =
  | { kind: 'profile'; field: ProfileField }
  | { kind: 'item'; sectionId: string; itemId: string; field: ItemField }
  | { kind: 'section'; sectionId: string; field: 'title' }
export interface Suggestion {
  id: string
  target: Target
  before: string
  after: string
  reason: string
  evidence: string[]
  question: string
  requiresConfirmation: boolean
  confirmed: boolean
  status: 'pending' | 'applied' | 'dismissed'
  references?: string[]
  reviewContext?: string
  materialSnapshot?: string
}
export interface Change {
  target: Target
  before: string
  after: string
}
export interface HistoryEntry {
  id: string
  label: string
  changes: Change[]
  suggestionIds: string[]
  createdAt: string
  reverted: boolean
}
export type Template = 'classic' | 'modern' | 'compact'
export interface ResumeDocument {
  id: string
  name: string
  revision: number
  template: Template
  locale: string
  market: string
  targetRole: string
  jobDescription: string
  content: ResumeContent
  analysisSummary: string
  analysisQuestions: string[]
  suggestions: Suggestion[]
  history: HistoryEntry[]
  sourceIds: string[]
  warnings: string[]
  extractionReviewed: boolean
  createdAt: string
  updatedAt: string
  workflow?: import('./workflow').Workflow
  conversation?: { messages: import('./chat').ResumeChatMessage[]; snapshot: string; handledCalls: string[] }
}
export interface Material {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}
export interface Source {
  id: string
  resumeId: string
  name: string
  dataUrl: string
}
export interface AISettings {
  mode?: 'server' | 'direct'
  baseUrl: string
  model: string
  vision: boolean
  jsonMode: boolean
}
export interface AIConnection extends AISettings {
  apiKey: string
  accessToken?: string
}
export interface Extraction {
  content: ResumeContent
  warnings: string[]
}
export interface Analysis {
  suggestions: Suggestion[]
  questions: string[]
  summary: string
}
