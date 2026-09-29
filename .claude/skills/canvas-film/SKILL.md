---
name: canvas-film
description: Multi-agent workflow for making a deterministic hand-drawn Canvas 2D short film with canvas-film-kit — kickoff questions, storyboard sign-off, parallel scene building, gate, fresh-context review, export, retro. Use when the user wants to "make a short film / explainer / history film / economics film / music video / MV with canvas-film-kit", "start a new canvas film", "procedural animation film", or says 「做教學片」「做歷史片」「做經濟片」「做MV」「用 canvas-film-kit 做片」「起一條新片」「做知識動畫」.
---

# canvas-film — multi-agent film workflow / 多 agent 做片流程

This is the process layer on top of `kit new` / `kit gate` / `kit export`. The kit enforces
*mechanical* correctness (determinism, sourced facts, no stray hex/seconds). It cannot tell whether
the film is any good, and it cannot know whether a human actually agreed to the plan. This workflow
covers those two gaps: **human sign-offs at P0** and **an independent story review at P5**.

> Language: one file, English body with Chinese (中文) glosses on the steps a user sees. One file
> rather than a separate `SKILL.zh.md` because Claude Code loads only `SKILL.md`, and two copies of a
> process drift apart silently. The kickoff questions have full bilingual wording in
> `references/kickoff-questions.md`.

Read first: repo `AGENTS.md` (the iron rules). References: `references/kickoff-questions.md`,
`references/rubrics.md`.

## Roles and model routing / 角色同模型分工

The session you are in is the **orchestrator**: it decides, dispatches, and reads verdicts. It does
not grade its own work.

| Work | Subagent | Why |
|---|---|---|
| Story, storyboard, scene code, art direction, final review | `model: opus` | Creative quality is the bottleneck. Scenes written by a weaker model in isolation tend to come out as slideshows with no story. |
| Tooling, wiring, gate fixes, bug fixes, fact research | `model: sonnet` | Well-specified implementation |
| Mechanical checks: re-running commands, grep, counting, read-back | `model: haiku` (or sonnet) | Cheap and repeatable; returns VERIFIED / MISMATCH |

**If a model isn't available, downgrade like this.** No opus: use the strongest model you have for
creative work and final review, and have the P5 reviewer run in a *fresh context* that has never
seen the build conversation. That independence matters more than which model does the review.
No haiku: use sonnet. Single-model setups (Codex, Cursor, one chat): keep the same phases, and for
P5 open a new session that sees only the repo, not the build chat.

## Iron rules (summary of AGENTS.md) / 鐵律

1. `render(t)` is a pure function of `t`. Never use `Math.random`, `Date.now`, or `performance.now`,
   and never keep state that accumulates across frames. Use `core/random.ts` for seeded randomness.
2. Colours come from `src/theme.ts` via `P`, and times come from `src/core/timeline.ts` via `T`/`seg()`.
   Never write a hex literal or a bare second value in a scene.
3. **Transitions run on shared geometry.** Every A→B seam names in `src/scenes/shared.ts` the
   array or shape that A hands to B. A seam with no shared geometry counts as a hard cut, even if it
   looks smooth. Judge by the shared data, not by eye.
4. **Every number and claim needs a source**: `research/fact_table.md`, `src/data/*.json` with
   `source`/`url`/`retrieved`, or `fictional: true`, which forces an on-screen "illustrative" badge.
   Never invent a citation.
5. **Every check has a negative fixture.** A check that has never failed is not evidence.
6. **Don't trust self-reports.** "Gate passed" or "60fps" is a claim until an independent agent
   re-runs the command and reads the output. Nobody verifies their own work.
7. **`approved_by_kickoff:` and `approved_by:` are human signatures.** An agent never writes them,
   including a placeholder, its own name, or the user's name on the user's behalf.

## The flow / 流程

Each phase lists **Do → Who → Deliverable → Exit gate**. Do not start a phase until the previous
exit gate is met.

### P0a — Kickoff five questions / 開工五問

- **Do**: Ask all five questions from `references/kickoff-questions.md` **in one message**, in
  plain words with no jargon: what the film is mainly about, what paces it, whether numbers appear
  on screen and where they come from, how long the sample and the full film are, and where it will
  be watched. Offer a recommended answer for each question so the user can reply with a word.
  (一條訊息問齊五條，用簡單字，每條附建議答案。)
- **Who**: orchestrator.
- **Deliverable**: Run `kit new <dir> --profile <p>` (or `npx create-canvas-film`); the Q2/Q3
  answers pick the profile. Record the answers in a `## Kickoff` section at the top of
  `docs/preproduction.md` (add the section if your scaffold doesn't have it yet), and set `W`/`H`/duration in `src/config.ts` from Q4/Q5.
- **Exit gate**: The user answers **personally**, and then **the user** adds
  `approved_by_kickoff: <name> <YYYY-MM-DD>` below the answers. You may show them the exact line to
  paste, but you never write it into the file yourself. This line records only that the direction is approved. It does not unlock P1.
  (開工方向要用戶親自答同簽；agent 唔准代簽。)
- Core/tool setup does not depend on the story and can start now.

### P0b — Pre-production + storyboard / 前期規劃同分鏡

- **Do**: Write `docs/preproduction.md`. It needs a logline, the protagonist (the single thing the
  viewer follows), the emotional or learning arc, a table of causal transitions (for each seam,
  "because X, then Y"), a beat sheet, a camera/scale arc, an information budget (facts per scene,
  every fact tied to a beat), a composition contract (hero size, and text size at the playback
  width), and a storyboard with **at least 2 keyframe sketches per scene**. Narration profiles also
  declare `speech_rate_cps:`. history/economics also start `research/fact_table.md`, with
  source tiers or dataset provenance.
- **Who**: `opus` writes it. `sonnet` does fact research for the fact table.
- **Deliverable**: `docs/preproduction.md` and storyboard stills or sketches.
- **Exit gate (HARD RULE / 硬規則)**: The user reviews the plan and **the user** adds
  `approved_by: <name> <YYYY-MM-DD>`. `kit gate` (story-metrics) refuses to run without it and
  rejects placeholder names. **An agent never writes, fabricates, or "helpfully pre-fills" this
  line**, not even to get past a failing gate (`AGENTS.md` §4). Changing the protagonist, driver,
  or facts answers after approval means the storyboard needs re-approval.
  (分鏡要用戶親自批；agent 代簽等於令 gate 講大話。)

### P1 — Lock contracts / 鎖定契約

- **Do**: Fill in `src/core/timeline.ts` (`T`, all beats as named `seg()`s) and
  `src/scenes/shared.ts` (the geometry each seam hands across). Once they are locked, they are
  frozen interfaces, and changing them afterwards is a deliberate, noted act.
- **Who**: `opus` (it owns the storyboard).
- **Exit gate**: `npm run typecheck` passes, and every seam in the storyboard has a named entry
  in `shared.ts`.

### P2 — Scenes / 場景

- **Do**: **Independent scenes**, which have no seam responsibility, can be built **in parallel**,
  one `opus` subagent each. **Seam scenes**, the two sides of a transition, are built **one after
  another**, because that is where rework concentrates. After each pair, render boundary stills
  (boundary frame ±1) with `npm run stills` and run `npm run boundary-diff`.
- **Who**: `opus` per scene; `sonnet` for component or tooling gaps.
- **Deliverable**: `src/scenes/*.ts`, with one commit per scene or per fix round.
- **Exit gate**: The seam pair's stills show no pop, and `qa/boundary-diff.json` has been written.

### P3 — Align to the driver / 按 driver 對齊

- `narration`: Run `kit tts build … --provider <p>` (or place your own WAVs), then `kit timeline`,
  `kit speech-rate`, and `kit onset-check`. Timing comes from **measured** audio, not estimates.
- `music`: Run `kit beats <audio>` over the **full track**. Don't extrapolate a beat grid from a
  short sample. beat-hit-rate is WARN-level below 0.7.
- `none`: Skip this phase.
- **Who**: `sonnet`. **Exit gate**: the driver's gate steps PASS, not SKIP, in `npm run gate`.

### P4 — Gate / 機械閘

- **Do**: Run `npm run gate` until every step is PASS (or SKIP only with a reason you can explain)
  and `qa/gate.json` is written.
- **Who**: `sonnet` fixes failures at the root cause. Never widen a regex, allowlist, or threshold
  just to go green (`AGENTS.md` §5).
- **Exit gate**: The gate is all green. `--skip-gate "<reason>"` is allowed **only if the user
  agreed**, with a real reason; it is logged to `qa/gate_skips.jsonl`, which you commit.

### P5 — Fresh-context review / 獨立覆檢

- **Do**: Dispatch a reviewer that **did not build the film**. It must:
  1. **Re-run** `npm run gate`, `npm run determinism`, and `npm run boundary-diff` itself, and
     compare against `qa/*.json`. It trusts no summary.
  2. Make a 1fps contact sheet from a **review render** (an `npm run export` of the current build) and grade it with the profile's table in
     `references/rubrics.md`. Any item below 3 means REJECT, with no averaging. A Hook item, where
     present, needs at least 4.
  3. Report technical findings as `Critical / Important / Minor / Nit / Pre-existing`, with the
     tally first and at most 5 Nits. Critical and Important block.
- **Who**: `opus`, fresh context. `haiku`/`sonnet` for the command re-runs.
- **Exit gate**: ACCEPT, or every REJECT reason is fixed and **re-reviewed by a fresh reviewer**.
  The reviewer re-checks the conditions it raised. The fixer never closes them itself.

### P6 — Export and deliver / 出片交付

- `npm run export` (it re-runs the gate). Check the ffmpeg exit code. Make a smaller share copy
  if the file is too big for the channel.
- Deliverable: the MP4, `qa/gate.json`, the P5 report, and a note of any skips. **Every number
  quoted in the delivery note (fps, duration, file size, pass counts) must come from a command
  output saved in the repo**, not from memory.

### P7 — Retro / 回顧

- Write `docs/retro.md` covering what broke, why, and which phase should have caught it. If the
  same failure happens twice, turn it into a check (a gate step with a good/bad fixture) or a
  mandatory line in the brief. A text reminder alone does not count.

## Dispatch brief templates / 派工 brief 範本

**Implement (sonnet / opus-for-scenes)**
```
Goal: <one sentence>. Repo: <path>. Profile: <p>.
Read first: AGENTS.md, docs/preproduction.md (approved), src/core/timeline.ts, src/scenes/shared.ts.
Scope: only <files>. Do NOT touch timeline.ts/shared.ts contracts, approved_by lines, or gate thresholds.
Rules: render(t) pure; colours via P; times via T/seg(); every on-screen number has a source.
Done = <observable result> + `npm run typecheck` + `npm run gate` output pasted verbatim.
Report: files changed, commands run with exit codes, anything you could not do.
```

**Verify (haiku / sonnet)**
```
Re-run, do not trust prior reports: <commands>. Compare against <qa/*.json or claim list>.
For each claim output: VERIFIED | MISMATCH (expected X, got Y) | UNVERIFIABLE (why).
Read-only. Do not fix anything.
```

**Review (opus, fresh context)**
```
You did not build this film. Repo: <path>. Profile: <p>.
1) Re-run npm run gate / determinism / boundary-diff yourself.
2) Build a 1fps contact sheet from <mp4>; grade with references/rubrics.md <profile> table.
   Every score cites a frame/time or file:line. Any item <3 (Hook <4) => REJECT.
3) Technical findings: tally first (Critical N · Important N · Minor N · Nit N · Pre-existing N).
Verdict: ACCEPT | ACCEPT WITH CONDITIONS (list) | REJECT (list). Do not edit files.
```
