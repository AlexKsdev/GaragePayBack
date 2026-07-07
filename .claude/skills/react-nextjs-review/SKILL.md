---
name: react-nextjs-review
description: Reviews React/Next.js (App Router) frontend code for overengineering and misused framework patterns — unnecessary useEffect/useState, prop drilling that should be composition or context, Server vs Client Component misuse, and client-side data fetching where a Server Component would do. Use whenever the user asks to review frontend/React/Next.js code for simplicity, correctness of rendering strategy, or "is this component too complicated", or after scaffolding new frontend code in a project connected to this backend. Only relevant once/where a React or Next.js frontend exists in the repo — this backend repo is NestJS-only today.
---

# React / Next.js review (App Router)

Same anti-overengineering philosophy as the backend's `clean-code-review`, applied to React/Next.js idioms. This backend project (`GaragePayBack`) is NestJS-only as of now — this skill applies if/when a frontend is added to this repo or a connected one. If asked to review frontend code and none exists yet, say so rather than inventing files to review.

## What to look for

- **`useEffect` doing what a render or server fetch could do.** Effects for syncing derived state, refetching on prop change, or reacting to your own state updates are usually a sign the state shouldn't exist — compute it during render instead. Reserve `useEffect` for real escape hatches: subscriptions, DOM measurement, imperative browser APIs.
- **`useState` for derived data.** If a value can be computed from props/other state, it doesn't need its own `useState` — that's a duplicated source of truth waiting to drift.
- **Server vs Client Component misuse.** Flag `'use client'` on a component that doesn't need interactivity, state, or browser-only APIs — it pushes JS to the client and forfeits server rendering for no reason. Flag the opposite too: interactive code (event handlers, hooks) stranded in a Server Component that will error at build/runtime.
- **Client-side fetching where a Server Component would do.** `useEffect` + `fetch` on mount for data available at request time is almost always worse than fetching directly in a Server Component or route handler — it costs a loading state, a waterfall, and a client bundle for no benefit.
- **Prop drilling vs composition/context.** Passing the same prop through 3+ intermediate components that don't use it themselves is a sign to either pass children/slots (composition) or lift the value into context — but only recommend context if the drilling is real and current, not speculative.
- **Component abstractions built for one caller.** A generic `<Wrapper variant="...">` with a single call site is premature, per the same "don't design for hypothetical future requirements" standard as the backend.

## How to review

1. Scope to the diff or the files the user names.
2. For each finding: cite the file/line, state the simpler alternative (e.g. "compute in render", "fetch in the Server Component and pass as a prop", "drop `'use client'`"), and why it's simpler given what the component actually needs to do.
3. Don't flag client components or effects that are doing genuinely necessary work (real subscriptions, real interactivity, real derived-async-state that can't be done at request time).

## Output

Report findings only, ranked by impact (bundle size / unnecessary requests / correctness risk first, style-level nits last). Don't rewrite components unless asked. If the code is already idiomatic, say so in one line.
