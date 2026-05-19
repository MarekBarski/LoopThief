---
description: Wrap up the current session — write session log entry, show diff, propose commit message. Do NOT push.
---

You are wrapping up the current working session.

Perform the following steps IN ORDER.

## Step 1 — Write the session log entry

Append a new entry to `docs/SESSION_LOG.md` at the TOP of the sessions list (reverse chronological — newest first).

Follow the exact template from the top of `SESSION_LOG.md`. Include all six sections:

- What was attempted
- What worked
- What didn't work / pitfalls hit (be specific — this is the most valuable section)
- Decisions made (anything Marek confirmed or rejected)
- Open issues / followups
- Files modified

Use today's date. Use a clear topic title (e.g., "16 LEVELS audio feedback fix", not "Worked on bugs").

Be honest about failures. If something was tried and abandoned, log it with the reason. Do NOT hide pitfalls — they are the most useful information for future sessions.

## Step 2 — Show the diff

Run:

```
git status
git diff --stat
```

Show the output to Marek so he can see what files changed.

## Step 3 — Propose a commit message

Suggest a commit message in this format:

```
<scope>: <short imperative summary>

<optional body if non-trivial>
```

Examples of good messages:
- `chop: fix LOOP mode to actually loop the region`
- `16levels: add live audio preview on pad click`
- `step: enable event playback on bar/step navigation`

Examples of BAD messages (do not produce these):
- `Various fixes` (vague)
- `Update files` (useless)
- `Session work` (meaningless)

## Step 4 — Ask Marek to review

Output exactly this:

```
SESSION WRAP READY.

Session log entry written to docs/SESSION_LOG.md.
Diff shown above.
Proposed commit message:
  [your proposed message]

Marek — please review the session log and the diff.
- "commit" to commit locally (I will not push)
- "edit log" to revise the session log entry
- "edit msg: ..." to change the commit message
- "no commit" to leave everything uncommitted
```

## Step 5 — Wait for Marek's response

If Marek says "commit":
- Run `git add -A && git commit -m "<message>"`
- Confirm completion
- **DO NOT push to remote. Pushing is Marek's decision and Marek's responsibility.**

If Marek wants edits, make them and ask again.

If Marek says "no commit", leave files staged or unstaged as they are and confirm.

## Critical rules

- **Never `git push` from this command.** Pushing is always Marek's manual decision.
- **Never force-push, never rewrite history, never amend old commits.**
- **Never delete or edit old SESSION_LOG entries.** They are historical record.
- If the working tree is dirty in ways you didn't expect (untracked files, unrelated changes), surface them to Marek before committing.
