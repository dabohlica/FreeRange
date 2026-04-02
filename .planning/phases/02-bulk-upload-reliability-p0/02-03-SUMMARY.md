---
phase: 02-bulk-upload-reliability-p0
plan: "03"
subsystem: upload
tags: [typescript, upload, ux, progress-bar, react]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [BulkProgressState, UploadProgressBar, structured-progress-state]
  affects: [app/(app)/admin/AdminClient.tsx]
tech_stack:
  added: []
  patterns: [structured-state-over-strings, inline-progress-component, tailwind-fill-bar]
key_files:
  created: []
  modified:
    - app/(app)/admin/AdminClient.tsx
decisions:
  - "bulkProgress string state replaced by BulkProgressState interface — done/skipped/failed/total/groupLabel fields enable live structured display"
  - "UploadProgressBar receives BulkProgressState prop and computes fill bar pct from (done+skipped+failed)/total"
  - "totalDone/totalSkipped/totalFailed accumulators added to handleBulkCreate for cross-group tracking"
  - "Button labels simplified to static 'Creating...' — progress detail moves to UploadProgressBar below"
metrics:
  duration: 5min
  completed: "2026-04-02"
  tasks_completed: 1
  files_modified: 1
---

# Phase 02 Plan 03: Upload Progress Bar Summary

One-liner: Replaced string-based bulkProgress state with BulkProgressState + UploadProgressBar showing live "X done · Y skipped · Z failed" count bar with animated fill during bulk upload.

## What Was Built

### Task 1: BulkProgressState, UploadProgressBar, state replacement

Three changes in `AdminClient.tsx`:

**BulkProgressState interface** added after `BulkUploadProgress`:
- Fields: `done`, `skipped`, `failed`, `total`, `groupLabel` (e.g. "Group 2/5 · Tokyo, Japan")
- Replaces `string | null` state — enables typed, structured rendering

**UploadProgressBar component** added above `AdminClient` export:
- Receives `progress: BulkProgressState` prop
- Renders count row: "X done · Y skipped · Z failed" with appropriate colors (`#171717`, `#737373`, `red-600`)
- Renders fraction `completed/total` in subdued `#a3a3a3`
- Fill bar: `bg-[#e5e5e5]` track, `bg-[#171717]` fill, `transition-all duration-300`, width driven by `style={{ width: \`${pct}%\` }}`
- Group label rendered as truncated `text-xs text-[#a3a3a3]` below bar

**State replacement in AdminClient**:
- `useState<string | null>(null)` → `useState<BulkProgressState | null>(null)`
- Variable: `bulkProgress` → `bulkProgressState`
- Setter: `setBulkProgress` → `setBulkProgressState`

**handleBulkCreate updated**:
- Added `totalDone`, `totalSkipped`, `totalFailed` accumulators
- Before each group upload: calls `setBulkProgressState({ done: totalDone, ..., total: g.files.length, groupLabel })`
- `onProgress` callback: `({ done, skipped, failed, total }) => setBulkProgressState({ ... })`
- Accumulates `summary.done/skipped/failed` after each `uploadInParallel` call
- `finally` and success path: `setBulkProgressState(null)`

**JSX updated**:
- Both Create buttons: `bulkSubmitting ? bulkProgress ?? 'Creating…'` → `bulkSubmitting ? 'Creating…'`
- `{bulkProgress && <p>...</p>}` → `{bulkProgressState && <UploadProgressBar progress={bulkProgressState} />}`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths are wired. `bulkProgressState` flows from `handleBulkCreate` → `setBulkProgressState` → `UploadProgressBar` → rendered JSX. Fill bar width is dynamic via `style={{ width: \`${pct}%\` }}`.

## Self-Check: PASSED

- app/(app)/admin/AdminClient.tsx — FOUND (modified)
- commit 9d1c599 (Task 1) — FOUND via git log
- interface BulkProgressState — line 57, count 1
- function UploadProgressBar — line 250, count 1
- bulkProgressState — 2 occurrences (state declaration + JSX render)
- UploadProgressBar progress={bulkProgressState} — 1 occurrence in JSX
- setBulkProgress( — 0 occurrences (all removed)
- bg-[#e5e5e5] rounded-full h-1.5 — 1 occurrence (fill bar track)
- style={{ width: — 1 occurrence (dynamic fill)
- npx tsc --noEmit — exits 0
