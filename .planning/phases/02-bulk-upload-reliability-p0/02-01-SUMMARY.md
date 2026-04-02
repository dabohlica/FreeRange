---
phase: 02-bulk-upload-reliability-p0
plan: "01"
subsystem: upload
tags: [typescript, upload, reliability, data-contracts]
dependency_graph:
  requires: []
  provides: [FileUploadStatus, BulkUploadProgress, UploadSummary, uploadInParallel-v2]
  affects: [app/(app)/admin/AdminClient.tsx]
tech_stack:
  added: []
  patterns: [per-file result inspection, typed upload summary, structured progress callbacks]
key_files:
  created: []
  modified:
    - app/(app)/admin/AdminClient.tsx
decisions:
  - "Added FileUploadStatus, BulkUploadProgress, UploadSummary interfaces to establish data contracts for subsequent plans"
  - "Call site adapter uses destructuring ({ done, total }) to keep UI working while Plans 02/03 add richer progress"
  - "Fixed both uploadInParallel call sites (single-entry and bulk) — second call site was not in plan spec but required for TypeScript compliance"
metrics:
  duration: 1min
  completed: "2026-04-02"
  tasks_completed: 1
  files_modified: 1
---

# Phase 02 Plan 01: Define Upload Data Contracts Summary

One-liner: Rewrote uploadInParallel to read per-file results from /api/upload response body, classifying each file as done/skipped/failed, returning a typed UploadSummary instead of void.

## What Was Built

Three TypeScript interfaces added to `AdminClient.tsx` near the `BulkGroup` interface:

- `FileUploadStatus` — per-file status union (done | skipped | failed)
- `BulkUploadProgress` — typed progress callback payload with done/skipped/failed/uploading/total counts
- `UploadSummary` — return type with counts and `failedFiles[]` array

`uploadInParallel` rewritten to:
1. Call `res.json()` on the `/api/upload` response (previously response body was discarded)
2. Inspect `body.results[0]` for `success`, `skipped`, or `error` fields
3. Track failures in `failedFiles[]`
4. Return `UploadSummary` instead of `void`

Both call sites updated to use destructuring syntax `({ done, total })` for the new progress callback shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed second uploadInParallel call site**
- **Found during:** Task 1 TypeScript verification
- **Issue:** A second call site at line 359 (single-entry upload in `handleSaveEntry`) used the old `(done, total)` two-argument signature, causing two TypeScript errors (TS2345, TS7006)
- **Fix:** Updated to destructuring `({ done, total })` matching the new `BulkUploadProgress` parameter shape
- **Files modified:** app/(app)/admin/AdminClient.tsx
- **Commit:** 91f05c6 (included in same task commit)

## Known Stubs

None — all data paths are wired. The `failedFiles` array and `UploadSummary` return value flow through but are not yet surfaced in the UI (that is handled by Plans 02 and 03 per design).

## Self-Check: PASSED

- app/(app)/admin/AdminClient.tsx — FOUND (modified)
- commit 91f05c6 — verified via git log
- interface FileUploadStatus — line 41
- interface BulkUploadProgress — line 48
- interface UploadSummary — line 57
- Promise<UploadSummary> — line 195
- npx tsc --noEmit — exits 0
