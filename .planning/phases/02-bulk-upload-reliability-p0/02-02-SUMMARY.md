---
phase: 02-bulk-upload-reliability-p0
plan: "02"
subsystem: upload
tags: [typescript, upload, reliability, retry, modal, ux]
dependency_graph:
  requires: [02-01]
  provides: [uploadWithRetry, UploadSummaryModal, bulkSummary-state, retryQueue-state]
  affects: [app/(app)/admin/AdminClient.tsx]
tech_stack:
  added: []
  patterns: [exponential backoff retry, silent retry, post-upload summary modal, inline retry with in-place count updates]
key_files:
  created: []
  modified:
    - app/(app)/admin/AdminClient.tsx
decisions:
  - "uploadWithRetry extracts single-file logic with up to 2 retries (500ms/1000ms backoff) — silent, no intermediate UI state change"
  - "handleBulkCreate now accumulates UploadSummary per group and shows modal only when failures or skips exist (clean success = immediate navigation)"
  - "Retry flow groups retryQueue by entryId so each entry's files upload together; onProgress updates bulkSummary in place (D-06)"
  - "Modal auto-closes when retryFailed === 0; Dismiss navigates to entries tab unconditionally"
metrics:
  duration: 3min
  completed: "2026-04-02"
  tasks_completed: 2
  files_modified: 1
---

# Phase 02 Plan 02: Retry Logic and Summary Modal Summary

One-liner: Added silent 2x exponential-backoff retry per file (uploadWithRetry) and a post-upload summary modal with inline failed-file retry that updates counts in place.

## What Was Built

### Task 1: uploadWithRetry helper

Added `uploadWithRetry` function above `uploadInParallel` in `AdminClient.tsx`:
- Wraps a single file upload with up to 2 automatic retries (3 total attempts)
- Exponential backoff: 500ms after attempt 1, 1000ms after attempt 2
- Retries are silent — no intermediate UI state change
- Returns `'done' | 'skipped' | 'failed'`

Updated `uploadInParallel` to delegate single-file fetch to `uploadWithRetry` instead of doing the fetch inline. The outer concurrency loop and `onProgress` callback are unchanged.

### Task 2: State, modal component, and wired retry flow

Three new state variables added to `AdminClient`:
- `bulkSummary: UploadSummary | null` — holds post-upload counts and failed filenames for modal display
- `retrying: boolean` — controls button disabled state and spinner during retry
- `retryQueue: Array<{ file: File; entryId: string }>` — holds File objects + their entryIds for re-upload

`handleBulkCreate` updated:
- Accumulates `totalDone / totalSkipped / totalFailed / allFailedFiles / allRetryQueue` across all groups
- Shows `UploadSummaryModal` when `totalFailed > 0 || totalSkipped > 0`
- Navigates to entries immediately (no modal) when everything succeeds

`UploadSummaryModal` component:
- Shows count row: uploaded / skipped / failed with appropriate colors
- Lists failed filenames in a scrollable card (red text)
- "Retry failed" button (visible only when `failed > 0`): re-uploads via `uploadInParallel` with real `onProgress` callback that updates counts in place; auto-closes modal when `retryFailed === 0`
- "Dismiss" button: clears all upload state and navigates to entries tab

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths are wired. `bulkSummary` flows from `handleBulkCreate` to modal JSX; retry flow re-uploads files and updates state in place.

## Self-Check: PASSED

- app/(app)/admin/AdminClient.tsx — FOUND (modified)
- commit 5d72491 (Task 1) — verified via git log
- commit bd49422 (Task 2) — verified via git log
- async function uploadWithRetry — line 192
- setTimeout(r, 500 * attempt) — line 199
- for (let attempt = 0; attempt <= maxRetries — line 197
- await uploadWithRetry(file, entryId) — line 239
- fetch('/api/upload' count: 1 (only in uploadWithRetry) — verified
- const [bulkSummary, setBulkSummary] — line 339
- const [retryQueue, setRetryQueue] — line 341
- const [retrying, setRetrying] — line 340
- function UploadSummaryModal — line 252
- <UploadSummaryModal JSX render — line 1056
- setBulkSummary(null) in onDismiss — line 1115
- retryFailed === 0 auto-close — line 1105
- if (totalFailed > 0 || totalSkipped > 0) — line 565
- no no-op progress callback — grep count 0
- npx tsc --noEmit — exits 0
