# LoopThief — Session Log

> Cross-session memory for Claude Code (and any other AI assistant working on this project).
>
> **Purpose:** AI sessions are stateless — when context window fills, all in-session knowledge is lost. This log preserves what was done, what was tried, what failed, and what decisions were made, so the next session doesn't repeat mistakes or undo intentional choices.
>
> **Rules for AI assistants:**
> - Read this entire file at the START of every session, after `CLAUDE.md` and required docs.
> - APPEND a new session entry at the END of every session, before reporting completion.
> - Never delete or edit past session entries — they are historical record.
> - If a past session's decision should be revisited, note that in a NEW session entry, do not modify the old one.
> - Be specific about file paths, function names, and what didn't work.
>
> **Format:** entries are reverse chronological — newest at the top.

---

## How to write a session entry

Each session entry follows this template:

```
## Session [N] — [YYYY-MM-DD] — [Brief topic]

### What was attempted
- Goal / task brought into this session.
- Files touched.
- Approach taken.

### What worked
- Specific changes that landed and validated (npm run build clean).
- Why the approach worked (if non-obvious).

### What didn't work / pitfalls hit
- Approaches tried and abandoned, with reasons.
- Bugs encountered during the session and how they were diagnosed.
- Things that looked right but caused regressions.

### Decisions made
- Architectural or product decisions taken during the session.
- Marek's confirmations / rejections of proposed approaches.
- Anything that should bind future sessions.

### Open issues / followups
- Things noticed but not addressed (logged to UX_AUDIT_FINDINGS.md or noted here).
- Bugs surfaced but deferred.
- Questions for Marek.

### Files modified
- Explicit list of changed file paths.
```

Keep entries factual, concise, and useful for the next session. Don't write essays. Don't reflect on the process. Just record what a future session needs to know.

---

## Anti-patterns to avoid in this log

- Vague entries ("worked on FX, fixed some bugs") — useless for the next session.
- Marketing language ("successfully implemented", "robust solution") — say what was done, not how good it was.
- Repeating content from `CLAUDE.md` or roadmap — those are separate.
- Hiding failures — if an approach didn't work, that's the MOST valuable thing to log.
- Editing old entries to "make them look better" — never. They are history.

---

## Sessions

<!-- Newest sessions go here, at the top. -->

<!-- Example entry (delete when first real session is logged):

## Session 1 — 2026-05-20 — Initial audit, no code

### What was attempted
- Read CLAUDE.md, roadmap_v2.md, AI_WORKFLOW_RULES.md, handoff doc.
- Inspected repo structure and confirmed file tree matches docs.
- Ran `npm run build` to verify clean baseline.

### What worked
- Build succeeded cleanly on first run.
- File tree matches documented structure.
- Identified that `src/store/useAppStore.ts` is ~XXX lines and the central state hub as documented.

### What didn't work / pitfalls hit
- (None — audit only, no code changes attempted.)

### Decisions made
- Confirmed with Marek: do not add ESLint/Prettier this session — defer per CLAUDE.md.
- Next session: start with 16 LEVELS audio feedback bug (Phase A1, highest priority per UX_AUDIT_FINDINGS.md).

### Open issues / followups
- Noticed `src/audio/samplerEngine.ts` has a TODO comment about voice stealing — flag for later, not addressed.

### Files modified
- None (audit only).

-->

<!-- Real entries start below this line -->
