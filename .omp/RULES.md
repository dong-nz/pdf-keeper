# Agent Rules

## General Principles

- Understand the existing codebase before making changes.
- Prefer simple, maintainable solutions over clever solutions.
- Do not introduce unnecessary dependencies.
- Do not rewrite working code unless there is a clear reason.
- Preserve existing behavior unless the task explicitly requires a behavior change.
- Follow the existing project architecture and coding conventions.
- Keep changes small and focused on the requested task.

## Before Making Changes

Before modifying code:

1. Inspect the relevant project structure.
2. Identify the modules/classes/components affected.
3. Read the existing implementation and related tests.
4. Identify existing utilities that can be reused.
5. Check whether similar functionality already exists.
6. Understand the data flow before changing it.

Do not start coding based only on the user's description.

## Change Workflow

1. **Investigate** — research the issue using the steps in Section 2.
2. **Report** — present findings: root cause, affected files, proposed fix.
3. **Confirm** — wait for user approval before applying any changes (code, config, docs, spec, or any file).
4. **Execute** — apply the approved change, verify, then report results.

## Conversation language

**IMPORTANT:** All responses are in English.

## Never auto-commit or auto-push

**NEVER** run `git commit` or `git push` without explicit user approval.

After completing a task, report results and **ask the user** if they want to commit/push.
Only proceed with `git commit` / `git push` when the user explicitly confirms.

## CRITICAL: Do not spawn subagents.

You MUST NOT use the `task` tool under any circumstances. Handle all tasks directly in the main session.

