# Kickoff five questions / 開工五問

A five-minute version of pre-production. The answers pick the profile, fix the canvas size, and give
the storyboard something concrete to be approved against. They do **not** replace
`docs/preproduction.md`, and they do not replace the gate.

**How to ask**
- Put all five in **one message**. Don't spread them across five turns.
- Use plain words. Don't use terms like "driver", "rubric", or "provenance". A user should be able
  to answer each one with a word or a pick.
- Put **your recommended answer** under each question, based on what the user has already told
  you, so the user can just say "yes" or pick one.
- Write the answers into `docs/preproduction.md` → `## Kickoff`, keeping the user's own words.

**Sign-off.** Once all five have the user's own answers, **the user** adds this line under them:

```
approved_by_kickoff: <name> <YYYY-MM-DD>
```

This records that the **direction** is approved. It does **not** unlock P1: `kit gate` only reads
`approved_by:` at the start of a line, and the separate `approved_by:` line comes after the
storyboard has been reviewed. Answering five questions is not the same as seeing the storyboard.
Agents never write either line.

**Changing an answer later.** Append `<YYYY-MM-DD> Q<n> changed from "<old>" to "<new>" — <reason>`
under the Kickoff section. Changing Q1–Q3 after `approved_by:` means the storyboard needs a new
approval. Big direction changes belong in the sample stage (Q4), not after it.

---

| # | Ask (English) | 問法（中文） | What it decides | Goes into | Rework it prevents |
|---|---|---|---|---|---|
| Q1 | What is this film **mainly about**? A thing, a person, a place, a process, or an idea? | 呢條片**最主要講乜**？一件物、一個人、一個地方、一個過程，定係一個道理？ | The **protagonist**: the one thing the viewer follows the whole way. It sets how P5 scores "protagonist presence". | preproduction.md "Protagonist"; `RUBRIC` via the profile | Two conflicting instructions ("feature product X" vs "the product isn't the point") that surface only after assets are made, and a whole batch gets thrown away |
| Q2 | What should the film **move with**? A song, a voice explaining, or just the pictures on their own? | 條片**跟乜嘢行**？跟一首歌、跟一把聲講解，定係畫面自己郁？ | **Driver**: `music` / `narration` / `none`. Whether you need a beat grid, TTS with measured timing, or neither. | `src/config.ts` `DRIVER` (set by profile); the P3 path | Aligning a short sample, then finding the full film is song-length and the sample's beat grid doesn't extrapolate |
| Q3 | Will **numbers, dates, or names** appear on screen? If yes, **where do they come from** (a document, a website, a dataset), or are they made up for illustration? | 畫面會唔會出現**數字、年份、人名**？有嘅話，**喺邊度搵返**（文件、網頁、數據集），定係示意用、虛構嘅？ | **Facts strength**: `none` / `label` / `knowledge` / `history` / `data`. Whether to start `research/fact_table.md`, `src/data/*.json` with source fields, or `fictional: true`. | `FACTS` (set by profile); fact table | A poetic line ends up rendered as a spec card with an unsourced number on screen |
| Q4 | How long a **sample** do you want to see first, and when? What's the **longest** the full film can be? | 你想**先睇一段幾長嘅試片**、幾時要？成條片**最長幾長**？ | The sample length and date (the checkpoint where direction changes are cheap), and the duration cap. Plan for at most about 90% of the cap so there is room to spare. | preproduction.md; `src/config.ts` duration | A film that fills its length cap with no room to fix pacing; direction changes after the full render |
| Q5 | Where will people **watch** it? Phone held upright, or wide on a laptop/TV? | 會喺**邊度睇**？手機打直，定係電腦／電視橫住睇？ | **Aspect ratio**: 9:16 or 16:9. Pick one. It also sets the reference width for text size (for phones, check text at 360px wide) and whether to check audio on phone speakers. | `src/config.ts` `W`/`H`; composition contract | Captions that shrink to a few pixels on a phone, or music that phone speakers can't reproduce, found only at the sample stage |

## Q2 + Q3 → profile

| Q2 answer | Q3 answer | Profile |
|---|---|---|
| pictures on their own | no text or numbers | `abstract` |
| a song | only the film's own title/slogan | `music` |
| a voice | general knowledge ("how X works") | `explainer` |
| a voice | dates, people, places in the past | `history` |
| a voice | quantities, charts, datasets | `economics` |

If the answers don't fit a row (for example, a song plus real statistics), say so, recommend the
closest profile, and note what that profile won't check. Don't quietly pick one.

## What the five questions do not cover

They only fix the direction and give the approval something to point at. Determinism, missing
sources, stray colours and times, and a missing signature are caught by `kit new` + `kit gate`, not
by asking. Answering the questions well doesn't mean you can skip the gate.
