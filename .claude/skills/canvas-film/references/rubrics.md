# P5 story / viewing rubrics / 故事同觀感評分表

`kit gate` catches **structural** red flags. `story-metrics` catches slideshow-shaped films: sparse
beats, evenly split scenes, a fixed camera. None of the gates judge whether the film is any good.
These tables do. Run the table for your profile at P5, in a fresh-context review.

## Rules that apply to every table

- **Score what you watched.** Build a 1fps contact sheet from the actual MP4, not stills the author
  picked. For narration profiles, make one sheet with captions and one without.
  ```
  ffmpeg -i film.mp4 -vf "fps=1,scale=240:-1,tile=8x12" sheet_%02d.png
  ```
- Every score cites **evidence**: a time (`00:14`), a frame number, or `file:line`.
- **2 and 4** are in-between scores. Say which condition of the next anchor up was missed, or else
  score it one lower.
- **Any item below 3 means REJECT.** No averaging. A **Hook** item, where present, needs **at least 4**.
- Rows marked **hard** are PASS/FAIL. A FAIL is a REJECT whatever the scores are.
- Pacing and camera anchors use the **same lines as `story-metrics`**: scene-length CV green ≥0.21 /
  red <0.16; camera coverage green ≥0.50 / red <0.20; avg beat gap green ≤1.2s / red >2.5s; max gap
  green ≤4.0s / red >6.0s. Before scoring camera, check that every registered camera function
  actually moves the picture in the scenes it claims. If it doesn't, camera scores at most 1.
- Thresholds marked *(suggested)* are starting values without a calibration set yet. Record what
  you measured so the project can tune them.

---

## A. `abstract` — pure visual, no text

| Item | 1 (poor) | 3 (pass) | 5 (good) |
|---|---|---|---|
| Protagonist | No single recognisable identity, or one with no reactions | An identity with at least 1 state change or reaction | ≥3 states; the start and end states clearly contrast |
| Causality | Every transition is "time's up, next shape" | Some transitions are causal, others just carry a shape over | ≥2/3 of seams answer "because X, then Y", and each has shared geometry in `shared.ts` |
| Pacing | story-metrics beat or CV red | Yellow, or green but it feels slow | All green **and** you can see tempo change (fast and slow passages) |
| Camera | coverage <0.20 | 0.20–0.50 | ≥0.50 **and** a scale arc you can state in one sentence |
| Composition | Hero small, lots of dead space | Hero visible but not dominant | Hero ≥40% of frame height *(suggested)*; clear eye path |
| Bookend | No echo, or an echo is claimed but the geometry doesn't line up | A thematic echo with a visible positional gap (state the gap size) | The end frame's geometry lines up with the start (≤5% of frame width) |

## B. `music` — paced by a song

| Item | 1 (poor) | 3 (pass) | 5 (good) |
|---|---|---|---|
| Visual identity | No recurring motif; each section is its own look | One motif/line vocabulary present in 50–80% of the runtime | One motif carries ≥80% of the runtime *(suggested)* and develops, not just repeats |
| Structure | Scene changes ignore song sections | Most seams land on a section boundary (verse/chorus/bridge) | Every seam lands on a section boundary, and the chorus is visually recognisable when it returns |
| On-beat | `beat-hit-rate` < 0.5 | 0.5–0.7 | ≥0.7 on the **full track** (not a sample window) *(suggested, same as the gate's WARN line)* |
| Camera | coverage <0.20 | 0.20–0.50 | ≥0.50, and camera energy follows the song's energy (bigger moves in louder sections) |
| Composition | Motif small, frame busy or empty | Motif readable at playback size | Motif reads at the playback width (Q5); negative space is deliberate |
| Lyrics stay lyrics | Lyrics or metaphors are rendered as data: numbers, units, or gauges with no source | Numeric-looking text is present but sourced or marked `fictional` | No numeric/spec-style text beyond the film's own title or slogan |
| Bookend | Same as A | Same as A | Same as A |

## C. `explainer` — narration, "how X works"

| Item | How to measure | 1 (poor) | 3 (pass) | 5 (good) |
|---|---|---|---|---|
| Protagonist = **one object the learner follows** (Q1) | Mark each 1fps frame Y/N for "the object is on screen". Changes to the same object count as Y. | <50%, or a new object every step | 50–80%, or ≥80% with no state change | ≥80% *(suggested)* **and** ≥2 state changes caused by the steps |
| Causality = **each step is the result of the last** | For every seam write "because X, so Y". A plain "first / second / also" list doesn't count. | <50% causal, or the steps are a parallel list (they could be reordered) | 50–80% | ≥80%, and every numbered step joins causally |
| Pacing | Scene-length CV plus the longest gap with no new visual event (slow continuous change doesn't count as an event) | CV <0.16, gap >8s, or one fact per scene | CV ≥0.16, gap 5–8s | CV ≥0.21, gap ≤5s, facts attached to step beats |
| Camera | Same lines as A. Each move has a stated purpose (locate / reveal / connect). | <0.20 | 0.20–0.50 | ≥0.50 plus a scale arc; any static shots are marked "static: for comparison" |
| Composition | List the **must-read text** (captions, step labels, key values). Check each one's px size at the Q5 playback width. | Captions themselves are too small | Captions OK; ≤1/3 of other must-read text too small | All must-read text meets size *(suggested: CJK ≥68px and Latin ≥42px on a 1920-wide frame, i.e. readable at 360px)* |
| Caption independence | Watch the no-caption sheet, muted, and write down the steps. | Can't tell the step order | Order clear only through on-screen numbers or titles | Each step's action is visible in the picture itself |
| Bookend = **question at the start, answer at the end** | Write the question and its time, then the answer and its time | No clear question, or no answer | Question and answer, but the answer switches objects or composition | Question within 15s; the answer uses the same object; the end composition lines up with the start (≤5% width) |
| **Hook** (pass line 4) | Frame-by-frame, first 10s | No protagonist in first 5s (title card, logo, empty) | Protagonist by 5s; the contrast or question comes after 10s | Protagonist by 2s, and a visible contrast or spoken question by 10s |
| **Hard: three-step recall** | A person who **has not read** the script or plan watches once on the Q5 device, with no pausing, then names three steps in order. Log who, the device, the date, and their words. An AI looking at thumbnails doesn't count. | — | FAIL = REJECT | PASS |
| **Hard: direction claims N/N** | Every sentence that says more/less, higher/lower, before/after, or because/so gets checked by hand against the source's original wording and logged in `qa/direction-check.md` | — | any mismatch or unchecked = REJECT | N/N checked and consistent |

## D. `history` — narration, the past

| Item | How to measure | 1 (poor) | 3 (pass) | 5 (good) |
|---|---|---|---|---|
| Protagonist = **one person, object, or place as the thread** | 1fps Y/N as in C. For a person, a silhouette or their object/place counts. | No thread; a list of events | Thread present 50–80% | Thread ≥80%, and it visibly changes because of the events |
| Chronology & causality | Plot the on-screen years in scene order. Any step backwards needs flashback grammar (a visual cue plus a caption or narration saying so). | Years jump around with no cue, or the events have no causal links | Mostly forward; causes stated for about half the seams | Forward, or flashbacks clearly marked; ≥80% of seams answer "because X, then Y" |
| Pacing | Same as C | Same as C | Same as C | Same as C |
| Camera & scale | Same lines as A. Then-and-now comparisons and map zooms count toward the scale arc. | <0.20 | 0.20–0.50 | ≥0.50, with a clear scale arc (for example room → city → continent → room) |
| Composition | Same must-read text check as C; the year axis labels count as must-read | Captions too small, or the year axis unreadable | Captions OK; ≤1/3 of other must-read text too small | All must-read text meets size; year always visible when it matters |
| Caption independence | Muted, no captions: can you tell **when** and **where** each scene is? | No | Only through caption text | From picture cues: year axis, map, era-specific drawing |
| Bookend = **now → then → now** | Start and end in the viewer's present, at the same place or object | No return | A return, but to a different place or object | Returns to the opening image, now seen differently |
| **Hook** (pass line 4) | First 10s | Starts on a date card or title | Thread by 5s, question after 10s | Thread by 2s, and a question or contrast ("why is X here?") by 10s |
| **Hard: sourcing 100%** | Every year, name, and place on screen or in narration has a row in `research/fact_table.md` with a tier (一手 primary / 二手 secondary / 通俗 popular) | — | any missing = REJECT | 100% |
| **Hard: disputed claims hedged** | Each `disputed: yes` row is shown with hedged wording (for example "一說" / "據載", "according to…") | — | a flat statement = REJECT | all hedged |
| **Hard: no fabricated likeness** | Real people appear only as silhouettes or as images whose licence is listed in the portrait manifest. **No AI-generated faces of real people.** | — | any = REJECT | none |
| **Hard: maps marked schematic** | Map routes without real coordinate data carry the "示意 / schematic" badge | — | missing badge = REJECT | present |

## E. `economics` — narration, quantities and charts

| Item | How to measure | 1 (poor) | 3 (pass) | 5 (good) |
|---|---|---|---|---|
| Protagonist = **one quantity or actor followed** (for example the price of one loaf) | 1fps Y/N for "the tracked quantity or actor is visible" | A new chart every scene with no common thread | Thread present 50–80% | Thread ≥80%, and the audience watches it change |
| Mechanism (causality) | Write the chain as "X rises → Y happens → Z". Each link should be shown, not just stated. | A list of statistics; no mechanism | A mechanism is stated, but some links are only told | Every link in the chain has its own visual event |
| Pacing | Same as C; a count-up or a growing chart counts as one event, not continuous activity | Same as C | Same as C | Same as C |
| Camera | Same lines as A; zooming into a chart region counts | <0.20 | 0.20–0.50 | ≥0.50 with a clear purpose for each move |
| Chart honesty & legibility | Units and axis labels are present; a non-zero baseline is marked; value labels are readable at the Q5 width; charts that compare things use the same scale | A missing unit, or a truncated axis with no marker, or an unreadable value | All present; some labels small | All present and readable; the comparison is obvious in under 3s |
| Caption independence | Muted, no captions: can you tell the **direction** of change (up/down, bigger/smaller)? | No | Only by reading numbers | From shape, size, and motion alone |
| Bookend = **question → answer** | Same as C; the answer is shown on the same quantity | Same as C | Same as C | Same as C |
| **Hook** (pass line 4) | First 10s | Opens on a chart title or definition | Question by 10s | A concrete, surprising contrast by 5s (for example "same bread, twice the price") |
| **Hard: data provenance** | Every chart value traces to `src/data/*.json` with `source`/`url`/`retrieved`, or the dataset is `fictional: true` **and** the "示意數據 / illustrative data" badge is on screen whenever that chart is | — | any unsourced value or missing badge = REJECT | 100% |
| **Hard: one-sentence mechanism recall** | A person who hasn't read the script watches once, then explains the mechanism in one sentence. Log who, the device, the date, and their words. | — | FAIL = REJECT | PASS |
| **Hard: direction claims N/N** | Same as C | — | any mismatch = REJECT | N/N |

---

## Report format

```
Profile: <p>  Reviewer: fresh context, did not build  Source: <mp4 path> + contact sheets
Scores: Protagonist 4 (00:03–00:58 Y 51/56) · Causality 3 (seam 3→4 is a list) · … · Hook 4
Hard checks: <name> PASS/FAIL (evidence)
Verdict: ACCEPT | ACCEPT WITH CONDITIONS | REJECT — <which items, what to fix>
```
