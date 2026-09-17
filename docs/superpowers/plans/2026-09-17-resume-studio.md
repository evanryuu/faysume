# Resume Studio Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for bounded tasks and independent review. User has authorized implementation of the discussed product flow.

**Goal:** Ship a runnable local-first screenshot-to-editable-resume application covering the six requested capability areas.

**Architecture:** Domain and reversible changes are independent of React and AI. IndexedDB transactions persist documents and history. An explicit BYOK browser adapter validates all model output; UI reviews extraction and suggestions.

**Tech Stack:** React, TypeScript, Vite, Dexie, Zod, Lucide, Vitest; browser verification.

## Tasks

- [x] 1. Research and spec: docs/research.md, specs above. Verify vision constraints, browser CORS, storage and printing against official sources. Review spec and this plan before implementing.
- [x] 2. Scaffold package.json/index.html/tsconfig.json/vite.config.ts; pin dependencies, disable lifecycle scripts when installing; use isolated staging directory then publish to new sibling project.
- [x] 3. src/domain.ts + tests/domain.test.ts: schemas, blank/example resumes, immutable field edits, copy version isolation, apply/revert with atomic conflict checks, backup validation. First write meaningful failing tests, implement, run npm test.
- [x] 4. src/db.ts + tests/db.test.ts: Dexie tables, serialized revision-checked document updates, local material/source management, safe backup export/import. Use fake-indexeddb tests.
- [x] 5. src/ai.ts + tests/ai.test.ts: validated Chat Completions adapter, URL validation, timeout/cancel, text connection test, image/text extraction, JD extraction, suggestions with evidence and questions. No hidden provider fallback or invented responses. Tests use HTTP boundary fetch injection and validate payloads/errors.
- [x] 6. src/components + src/App.tsx + src/styles.css: dashboard, multi-resume management, import review, content editor, three templates, suggestions with apply/reject/revert, material library and settings. Product style: warm-neutral workspace with forest green actions and paper preview. Integrate current-user data, never auto-upload anything.
- [x] 7. Verify: npm test, npm run build, browser workflows and responsive layout. Review spec coverage then code quality; fix issues and repeat affected checks. Write README with exact commands and limitations; copy artifacts to new project and start preview.

## Definition of done

All six requested capability areas have usable first-version flows. Unsupported features (PDF/DOCX ingestion, hosted proxy, account sync, pixel-perfect screenshot recreation) are explicitly excluded in documentation. Tests verify failure cases, and no claim is made of live provider quality without a user-supplied key. No old-project source changes.

## Verification result

26 core tests and 4 browser workflows passed. TypeScript and Vite production build passed. A one-page Chinese sample PDF was text-extracted with pypdf and rendered for visual review. Independent spec and code reviewers approved after conflict, focus, and cancellation fixes. Real-provider OCR quality remains unverified without user credentials. Online Superdesign draft was unavailable because authentication could not write its configuration; the local UI was implemented and visually checked instead.
