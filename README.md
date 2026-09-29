# canvas-film-kit

**用程式碼畫出手繪線稿風格嘅教學／歷史／經濟／音樂短片——同一份 code，喺 Mac、Windows、Linux 都出到同一種風格，出片前自動驗事實同渲染。**

*(English README: [README.en.md](README.en.md))*

<p>
  <img src="docs/media/abstract-hero.gif" width="360" alt="abstract profile demo — 一條線一鏡到底變圓、波、螺旋">
</p>

| abstract | music | explainer | history | economics |
|---|---|---|---|---|
| ![abstract still](docs/media/abstract.jpg) | ![music still](docs/media/music.jpg) | ![explainer still](docs/media/explainer.jpg) | ![history still](docs/media/history.jpg) | ![economics still](docs/media/economics.jpg) |

> 呢 5 張圖／GIF 全部由 `demos/` 入面實際跑出嚟嘅 MP4 抽 frame（`docs/media/` 總大小 &lt;1MB）——冇一張係手畫嘅 mockup。

---

## 呢個 kit 做乜

- **`render(t)` 係純函數**：畀同一個 `t`，任何時候、任何機都渲出完全相同嘅一幀（`kit gate` 嘅 determinism 步驟會真係順序/倒序/亂序 seek 嚟驗呢件事，唔係得個講字）。
- **顏色同時間各自得一個家**：hex 色淨係喺 `theme.ts`、秒數淨係喺 `timeline.ts`——`kit gate` 嘅 grep gate 唔准第二度出現。
- **出片前自動驗事實**：畫面上嘅數字／史實要有出處（`research/fact_table.md` 或 `src/data/*.json`），冇出處又唔係「示意數據」就 FAIL。
- **一個人手簽名步驟**：`docs/preproduction.md` 嘅 `approved_by: <name> <YYYY-MM-DD>`——呢係全條 gate 入面唯一唔係機械檢查嘅一步，故意留畀人睇過先批（見 [AGENTS.md](AGENTS.md) §4）。
- **核心零 Python**：`doctor`／`gate`／`export`／`stills`／`determinism`／`boundary-diff` 全部純 Node，唔使裝 Python（想用本地 whisper 對齊先至要）。

## 安裝

需要：**Node 22.12+**（建議 24 LTS）、**ffmpeg ≥6**（要有 `libx264`）、git。瀏覽器優先用你已裝嘅系統 Chrome，冇就會 fallback 用 Playwright 內建 Chromium。

| 平台 | 裝 ffmpeg |
|---|---|
| macOS | `brew install ffmpeg` |
| Windows | `winget install ffmpeg` 或 `choco install ffmpeg` |
| Linux (Debian/Ubuntu) | `sudo apt-get install ffmpeg` |

裝完之後，`npx create-canvas-film` 或 `kit doctor` 會逐項報 PASS/WARN/FAIL（Node 版本、ffmpeg、瀏覽器、GPU renderer、字體、磁碟空間……），`doctor --fix` 只會印安裝指令，唔會幫你裝嘢。

## 快速開始

呢個 kit **唔會發佈上 npm registry**——一律經 GitHub 安裝（見
[`docs/design/why-file-dependency.md`](docs/design/why-file-dependency.md)）。

```bash
npx --yes github:Inari-Kira-Isla/canvas-film-kit#v0.2.0 new my-film --profile explainer
cd my-film
npm install
npm run dev              # 開住一個 terminal 唔好關
```

再開一個 terminal：

```bash
npm run doctor            # 診斷用，永遠 exit 0
npm run gate              # 出片前嘅全部機械檢查
npm run export            # 會自己先跑一次 gate，唔過唔出片
```

`kit new` 起好嘅專案已經有一份會過 gate 嘅示範內容——但 `docs/preproduction.md` 入面嘅 `approved_by:` 一行係佔位字，你要自己填先過到 gate（見下面「gate 同 `approved_by`」）。

> **另一個做法（唔使每次都上網下載）**：`git clone` 呢個 repo 落嚟，喺 repo 根目錄 `npm install` 一次，之後用 `node packages/kit/bin/kit.mjs new ../my-film --profile explainer` 起新片——呢個做法起出嚟嘅專案會指返去你本機嗰個 clone（`file:` 依賴），適合會不斷起多個片、唔想每次都重新拉一次 GitHub 嘅情況。

## 用 Claude Code 做片

呢個 repo 自帶一個 Claude Code skill：[`.claude/skills/canvas-film/`](.claude/skills/canvas-film/SKILL.md)。喺 Claude Code 講「做教學片／歷史片／經濟片／MV」，佢會照一條多 agent 流程行：開工五問 → 你批分鏡（`approved_by` 一定係你自己簽）→ 場景並行／串行 → `npm run gate` → 由一個冇參與製作嘅 agent 獨立覆檢（跟 profile 評分表）→ 出片 → 回顧。
想喺呢個 repo 以外都用得到，將成個 `canvas-film/` 資料夾 copy 去你 Claude Code 嘅 global skills 資料夾（實際路徑睇 Claude Code 官方文件）。Codex／Cursor 用戶可以照 [AGENTS.md](AGENTS.md) §7 手動行同一套流程。

## 五種 profile

`--profile` 決定三條軸：`driver`（乜嘢帶動節奏：narration/music/none）、`facts`（要唔要驗事實、驗到邊個程度）、`rubric`（用邊套故事結構規則覆檢）。

| profile | driver | facts | 適合 | 示範 |
|---|---|---|---|---|
| `abstract` | 無 | 無 | 純視覺、冇文字冇數字嘅片段 | 「One Line」——一條線一鏡到底變圓、波、螺旋 |
| `music` | 音樂拍子 | 只准自己聲明嘅名/口號 | MV、節奏向短片 | 「Tide Lines」——海浪線稿隨拍子起伏 |
| `explainer` | 旁白 | 知識性事實 | 教學、概念拆解 | 「月亮點解有圓缺」——幾何題，來源 NASA |
| `history` | 旁白 | 史實（分一手/二手/通俗） | 歷史敘事 | 「印刷術點樣傳遍歐洲 1450–1500」——年份軸＋示意地圖 |
| `economics` | 旁白 | 數據（每個圖表數字要有 dataset） | 經濟／數據敘事 | 「虛構小島嘅麵包價：乜嘢係通脹」——完全虛構 dataset，示範「示意數據」標籤 |

每個 profile 用邊啲元件、邊啲 gate 步驟會另外行、`kit new` 起好之後仲欠邊步，睇 [`docs/design/profiles.md`](docs/design/profiles.md)。

## 配音（TTS）

`explainer`／`history`／`economics` 用得到 `kit tts build`；`music` 唔使旁白、`abstract` 冇文字。

| provider | 要唔要錢 | 要邊個 env 變數 | 備註 |
|---|---|---|---|
| `none` | 免費 | 冇 | 預設；字幕-only，或者你自己擺一份 `.wav` 入 `audio/vo/` |
| `system` | 免費 | 冇 | 用你部電腦本身嘅 TTS（macOS `say` 等） |
| `edge`（**experimental**） | 免費 | 冇 | 非官方端點，可能隨時失效，唔入 CI、唔做預設，用之前自己睇清楚服務條款 |
| `minimax` | 收費 | `MINIMAX_API_KEY`（`MINIMAX_GROUP_ID` 可選） | 有自帶字幕時間戳 |
| `openai` | 收費 | `OPENAI_API_KEY` | model 名喺 config 度自己填 |

**金鑰規則**：呢個 kit 淨係讀 `process.env`——冇任何 dotfile fallback、冇任何 kit 自己嘅憑證檔。想用 `.env` 就自己 `node --env-file=.env`。`kit doctor` 淨係報「呢個 env 變數有冇set」，唔會印出個值。

```bash
kit tts build my-film --script content/vo_script.json --provider minimax --voice <voice-id> --lang zh
```

## gate 同 `approved_by`

`kit gate` 一次過跑晒 typecheck、grep gate（hex/秒數）、nondeterminism check、事實/來源檢查、determinism、boundary-diff 呢啲機械檢查，結果寫入 `qa/gate.json`。`kit export` 出片前一定會先跑一次 `gate`，唔過就唔出片。

**點用 `approved_by:`**——喺 `docs/preproduction.md` 手打一行：

```
approved_by: <你個名> <YYYY-MM-DD>
```

呢個係全條 gate 入面**唯一唔係機械檢查**嘅一步：一個人真係睇過分鏡／邏輯先簽名，`test`/`tbd`/`todo` 呢類佔位字會被拒（AI agent 唔准代填，見 [AGENTS.md](AGENTS.md) §4）。

**點「關」**——而家呢個版本冇一個「成個專案唔要呢步」嘅 config 開關；已經有嘅逃生門係：

- `kit export --skip-gate "<一個真正嘅理由，唔准係佔位字>"`——會將理由連時間戳寫入 `qa/gate_skips.jsonl`（呢個檔案要 commit，一次跳過就係一次留底，唔係靜默消失）。
- `kit gate`／`story-metrics.mjs --calibrate`——用嚟重新量度一條**已經批過**嘅片（例如改咗渲染邏輯想確認舊片仲過唔過），唔係第二個首次批核嘅方法。

> 設計筆記提過想加一個 `kit.config.json` 嘅 `gates.approval` 開關等成個專案永久跳過呢步——呢個版本未實作，上面兩條先係現實中用得嘅逃生門。

## 出片前公開清理（`release-scan`）

如果你 fork 咗呢個 kit、想公開自己嘅版本，跑：

```bash
node scripts/release-scan.mjs .        # 個人路徑／email／電話／金鑰模式 全掃（通用規則，repo 內建）
gitleaks detect --no-git --source .    # 額外一重憑證掃描（冇裝會印安裝指令，唔會假裝過咗）
```

兩個都要 0 finding 先算乾淨。

`release-scan.mjs` 本身只有通用規則（絕對路徑、email/電話、金鑰形狀）——**唔會**幫你掃你自己嘅品牌名/內部代號/個人身份，因為嗰啲字唔應該出現喺一個公開 repo 嘅原始碼入面（連掃描工具自己都唔可以有）。要掃嗰類私人字，抄一份
[`scripts/private-terms.example.txt`](scripts/private-terms.example.txt) 去 repo 外面（預設
`~/.config/canvas-film-kit/private-terms.txt`，或者用 `RELEASE_SCAN_PRIVATE_TERMS=<path>` 指去第二個位），填返你自己嘅真實字，先至跑上面嗰句。冇呢個檔一樣可以跑（只係少咗嗰個分類，會印一句提示）。

## 跨平台備註

- **Windows**：`npm run` scripts 全部係 `node xxx.mjs`，唔靠 `&&`/`rm`/shell-only 語法；檔名唔用 CJK。
- **「同一種風格」嘅關鍵係字體**：canvas 缺字會靜默 fallback 去系統字體，風格即刻走樣。`kit fonts` 會下載＋sha256 鎖定呢個 kit 用嘅 OFL 字體（Noto Sans/Serif TC、Inter、JetBrains Mono）到 `public/fonts/`——字體本身**唔會**進呢個 repo（每個 CJK 字重幾 MB，會令 repo 臃腫），下載失敗會 fail loud 唔會靜默轉用系統字。
- **保證嘅係「同風格」，唔係「像素完全相同」**：唔同機嘅字體光柵化（CoreText/DirectWrite/FreeType）同 GPU 始終有微細差異；同一部機、同一個 render 就保證 bit-identical（`kit gate` 嘅 determinism 步驟驗嘅係呢個）。

## Repo 結構

```
packages/kit/                → npm 套件 canvas-film-kit：kit CLI、gates、renderer、scaffold、templates
packages/create-canvas-film/ → npm 套件 create-canvas-film：薄 wrapper，包裝返 kit 嘅 scaffold
demos/{abstract,music,explainer,history,economics}/  → 5 條示範片，CI 真渲
docs/design/                 → 點解要咁樣起（gate 設計理由、profile 表、npm 發佈備註）
docs/media/                  → README 用嘅截圖/GIF（全部由 demos/ 抽出嚟，唔係手畫）
scripts/                     → repo 級工具（release-scan、路徑檢查、fixture 測試）
.github/workflows/           → CI（見下）
```

## CI

`.github/workflows/ci.yml` 喺 ubuntu/macos/windows 三個 OS 跑 doctor + gate + abstract demo export + 全部 gate 嘅 good/bad fixture 測試 + release-scan。

## 常見問題（FAQ）

**啲片睇落好似邊套片？** 線稿感、手繪 wobble、紙感 grain——呢個 kit 嘅 `theme.ts` 有三個預設（`ink-night`／`paper-day`／`chalkboard`），全部係公開設計嘅新色值，唔係抄任何品牌配色。

**可以用嚟做真實歷史/經濟片咩？** 可以，但 `history`／`economics` profile 逼你交出處（`research/fact_table.md`、`src/data/*.json`），完全虛構嘅內容要標 `fictional: true`——畫面會強制出現「示意數據」標籤，呢個係設計選擇，唔係漏洞。

**點解冇 GUI／時間軸編輯器？** 呢個 kit 嘅賣點正正係「code 係 single source of truth，agent 照住規則改得放心」——GUI 唔喺呢個版本嘅計劃內（見 `docs/design/`「今次唔做」）。

**渲染好慢點算？** `kit doctor` 會話你知而家用緊邊隻 GPU renderer——見到 `SwiftShader`/`llvmpipe`（軟件渲染，例如喺 Docker 或者冇 GPU 嘅 CI）就預咗慢。呢個版本冇 `--scale` flag，想快啲睇預覽可以降 fps，例如 `kit export <url> <out.mp4> <dur> 12`。

**識用 AI coding agent（Claude Code/Codex/Cursor）嚟起片？** 讀 [AGENTS.md](AGENTS.md)——入面係畀 agent 讀嘅鐵律（`render(t)` 要純函數、禁 `Math.random`/`Date.now`、色/時間各自一個家、`approved_by` 人手簽名唔准代填）。`CLAUDE.md` 已經 `@AGENTS.md` 咗，Claude Code 會自動讀到。

## 授權

**MIT**（見 [LICENSE](LICENSE)）。`kit fonts` 下載嘅字體係 **SIL OFL 1.1**，唔會進呢個 repo——下載時會連 `OFL.txt` 一齊寫入 `public/fonts/`。

## 貢獻

見 [CONTRIBUTING.md](CONTRIBUTING.md)（新 gate 檢查要有 good/bad fixture）、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)、[SECURITY.md](SECURITY.md)（回報安全問題）。呢個 project as-is、best-effort 維護，冇 SLA。
