---
name: clean-code-review
description: Reviews the current diff or a given set of files for overengineering — premature abstraction, unused generalization, dead code, unnecessary indirection, and config/feature-flag creep that isn't earning its complexity. Use whenever the user asks to check for overengineering, "is this too complex", wants a simplicity/YAGNI pass, or after writing a new module/service when you want a second opinion on whether it's more elaborate than the task required. Distinct from /code-review (bug-hunting) and /simplify (general reuse/efficiency) — this skill's only question is "does this complexity earn its keep."
---

# Clean-code / anti-overengineering review

This is a narrow lens, not a general code review. Its only question: **does every abstraction, layer, and generalization in this diff earn its complexity given what was actually asked?** Bugs, style, and general reuse opportunities belong to `/code-review` and `/simplify` — don't duplicate their job here.

The standard is CLAUDE.md's own: *"Three similar lines is better than a premature abstraction."* *"Don't design for hypothetical future requirements."* Hold the diff to that bar.

## What to look for

- **Premature generalization** — a generic/configurable solution built for one caller. If there's exactly one call site, the abstraction is speculative until a second one shows up.
- **Unused flexibility** — options, strategy patterns, config flags, or interfaces with only one implementation and no near-term second one.
- **Extra indirection** — a wrapper, factory, or service layer that just forwards to another function with no added behavior.
- **Dead code** — exported functions/types/DTOs nothing imports, unreachable branches, commented-out code.
- **Speculative fields/params** — DTO fields, function params, or table columns added for a "future case" not in the actual request.
- **Validation/error handling for impossible states** — checks guarding against inputs that can't occur given the caller graph (per CLAUDE.md: only validate at trust boundaries).
- **Duplication that's actually fine** — the flip side: don't recommend introducing an abstraction to remove 2-3 similar lines. Flag over-abstraction, not under-abstraction, unless the duplication is genuinely large and error-prone (e.g. the same 40-line block copy-pasted five times).

## How to review

1. Scope to the diff (`git diff` against the base branch, or the files the user names) — don't audit the whole repo unless asked.
2. For each finding, name the specific file/line, state what would be simpler, and why the current complexity isn't justified by what's actually called or required today.
3. Skip anything genuinely justified by real (not hypothetical) multiple call sites, an explicit requirement, or a security/correctness need — say so briefly if you considered and dismissed something, so the user knows it wasn't missed.

## Output

Report findings only — do not rewrite the code unless the user asks for fixes. Rank by how much complexity/token-cost each one is adding relative to the value it provides. If nothing overengineered is found, say so in one line; don't manufacture findings to have something to report.
