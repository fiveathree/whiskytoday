# Whisky Today — 開發規格（PLAN.md）

> 本文件是給 Claude Code 的開發規格。產品大綱（給用戶看的非技術版本）另存於 Claude Docs。
> 版本：v1.0（2026-11-04）

---

## 0. 給 Claude Code 的工作守則

1. **六大減 Code 原則，按次序遵守**
   1. 先判斷功能是否真的需要（本文件未列明的功能，不要自行加入）
   2. 檢查專案是否已有現成功能
   3. 優先用標準函式庫
   4. 優先用瀏覽器、資料庫及平台原生功能（D1、Cron Triggers、Cloudflare Access、`<dialog>`、`window.print()` 等）
   5. 優先用現有套件
   6. 以上都不可行，才寫最少但能正確運作的程式碼
2. **一次只做一個階段**（見 §11），每階段完成並通過驗收才開始下一個。
3. **項目擁有人不是工程師**。凡需要他在 Cloudflare、GitHub 等網站上親手操作的設定，必須由零開始逐步寫出（每一步寫清楚撳邊個掣、掣上面寫咩字），並用目前最新、準確的介面名稱；不肯定介面名稱時，先查 Cloudflare 官方文件再寫。
4. 每個頁面必須有 **favicon** 及 **share image（og:image）**。
5. 每個畫面盡量 **一屏睇晒**，不用上下或左右捲動（長列表用分頁或篩選，而非無限捲動）。
6. 介面語言：繁體中文（書面語）+ English，可切換；預設繁中。
7. 不要把任何 API key 放在前端或 commit 入 repo。

---

## 1. 產品定位

**Whisky Today**：私人高端威士忌情報及酒款分享平台。

- **主要用戶（唯一管理員）**：一位從事高端威士忌（每支 HK$10,000 以上）投資及買賣、亦定期開班分享的專業人士，客戶為香港及台灣的高端收藏者及 Distributor。
- **核心需求**
  1. 每日整理全球各地威士忌消息，附 AI 分析；其中一個「投資者焦點」標籤，專門給專業威士忌投資者。
  2. 讓 Distributor 及客戶看到每支酒的資料、相關消息及參考價值。
- **不做**：大眾酒款資料庫、交易平台、收款、用戶註冊、社群評論、保證回報的預測、自動爬取有版權或條款禁止的價格數據。

---

## 2. 技術架構

| 層 | 選擇 | 備註 |
|---|---|---|
| 應用 | **單一 Cloudflare Worker**（含 Static Assets） | 前端靜態檔 + API + 分享頁同一個 Worker |
| 前端 | 純 HTML / CSS / 原生 JS（ES modules） | 不用前端框架、不用 build step |
| 資料庫 | Cloudflare D1（SQLite） | 全文搜尋用 FTS5 |
| 檔案 | Cloudflare R2 | 酒瓶相片、來源證明文件 |
| 排程 | Cron Triggers | 每日兩次收集新聞 |
| 管理員登入 | **Cloudflare Access**（Zero Trust）保護 `/admin*` 及 `/api/admin/*` | 不自寫登入系統；Worker 內驗證 `Cf-Access-Jwt-Assertion` |
| AI | Claude API（Worker secret `ANTHROPIC_API_KEY`） | 只在 Worker 後端呼叫 |
| 每日簡報 email | Cloudflare Email Routing 的 `send_email` binding，寄到已驗證的管理員地址 | 不引入第三方 email 服務 |
| 匯率 | 每日取一次公開匯率（來源待驗證），存 D1 | 只需 HKD、TWD、GBP、USD、JPY、EUR |
| PDF | 瀏覽器列印（`window.print()` + print CSS，A4） | 不自建 PDF 引擎 |
| 圖表 | 原生 SVG 自繪（價格歷史線圖） | 不引入圖表庫，除非 SVG 不可行 |

GitHub repo：`fiveathree/whiskytoday`。部署用 `wrangler`（GitHub Actions 或手動 `wrangler deploy`，揀最簡單者並寫出步驟）。

### 2.1 建議目錄結構

```
/public            靜態檔（index.html、admin.html、share.html、css、js、favicon、og.png）
/src/worker.js     Worker 入口：路由 fetch() 及 scheduled()
/src/news.js       收集、去重、AI 處理
/src/score.js      評分（純函數，可單元測試）
/src/share.js      分享連結
/src/db.js         D1 查詢
/migrations/*.sql  D1 schema
/test/*.test.js    評分及去重的測試（Node 內建 test runner）
wrangler.toml
```

---

## 3. 資料模型（D1）

所有時間存 ISO 8601 UTC 字串。所有金額存 **原幣種整數（最小單位，例如仙）+ 幣種代碼**，換算結果不覆蓋原值。

```sql
-- 新聞來源
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_url TEXT NOT NULL,
  feed_url TEXT NOT NULL,          -- RSS / Atom
  region TEXT NOT NULL,            -- scotland, japan, usa, taiwan, hk_china, ireland, other
  language TEXT NOT NULL,          -- en, ja, zh-Hant ...
  kind TEXT NOT NULL,              -- news, auction, blog, official
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_error TEXT
);

-- 新聞（一篇 = 一單事件，可有多個來源）
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL REFERENCES sources(id),
  original_title TEXT NOT NULL,
  original_language TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,      -- 正規化標題 hash，用於去重
  cluster_id TEXT,                 -- 同一事件的多篇報道共用
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processed, published, hidden, failed
  category TEXT,                   -- 見 §4.3
  importance INTEGER,              -- 1–5
  investor_focus INTEGER NOT NULL DEFAULT 0,
  title_zh TEXT, title_en TEXT,
  summary_zh TEXT, summary_en TEXT,
  facts_json TEXT,                 -- 事實（附來源）
  claims_json TEXT,                -- 來源說法（未證實）
  ai_view_zh TEXT, ai_view_en TEXT,-- AI 解讀（明確標示）
  investor_card_json TEXT,         -- 見 §4.4，非投資者焦點則為 NULL
  ai_model TEXT, prompt_version TEXT, token_cost INTEGER
);
CREATE VIRTUAL TABLE articles_fts USING fts5(title_zh, title_en, summary_zh, summary_en, content='articles', content_rowid='rowid');

-- 酒廠 / 品牌 / 公司
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- distillery, brand, company, bottler, auction_house
  name_en TEXT NOT NULL,
  name_zh TEXT,
  aliases TEXT,                    -- JSON array，用於新聞配對
  region TEXT,
  status TEXT,                     -- active, closed, mothballed, reopened
  description_zh TEXT, description_en TEXT,
  is_tracked INTEGER NOT NULL DEFAULT 0   -- 管理員追蹤中
);
CREATE TABLE article_entities (
  article_id TEXT NOT NULL REFERENCES articles(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  direction INTEGER,               -- +1 利好 / 0 中性 / -1 利淡（只限投資者焦點）
  PRIMARY KEY (article_id, entity_id)
);

-- 酒款版本（例：某酒廠某年份、某桶號的裝瓶）
CREATE TABLE editions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  distillery_id TEXT REFERENCES entities(id),
  brand_id TEXT REFERENCES entities(id),
  bottler_id TEXT REFERENCES entities(id),
  name_en TEXT NOT NULL, name_zh TEXT,
  category TEXT,                   -- 用於 Tier 分組上限，例：closed_distillery, japanese, macallan, single_cask
  vintage_year INTEGER, bottling_year INTEGER, age_years INTEGER,
  cask_type TEXT, cask_number TEXT,
  edition_size INTEGER,            -- 限量瓶數，未知為 NULL
  abv REAL, volume_ml INTEGER,
  description_zh TEXT, description_en TEXT,
  tasting_zh TEXT, tasting_en TEXT,
  owner_comment_zh TEXT, owner_comment_en TEXT,   -- 專業評語，可公開
  target_price_minor INTEGER, target_currency TEXT,     -- 投資卡：目標價（管理員輸入）
  floor_price_minor INTEGER, floor_currency TEXT,       -- 投資卡：最低可接受出售價
  holding_months INTEGER,                               -- 投資卡：預計持有期
  is_tracked INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 實際單瓶（同一版本每支瓶況可不同）
CREATE TABLE bottles (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  bottle_number TEXT,              -- 例：18/120
  fill_level TEXT,                 -- 例：into neck, top shoulder
  seal_condition TEXT, label_condition TEXT,
  has_box INTEGER, box_condition TEXT,
  acquired_year INTEGER,
  provenance_note TEXT,            -- 私人，預設不公開
  cost_minor INTEGER, cost_currency TEXT,   -- 購入成本，永不公開
  private_note TEXT,               -- 永不公開
  created_at TEXT NOT NULL
);
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  edition_id TEXT REFERENCES editions(id),
  bottle_id TEXT REFERENCES bottles(id),
  r2_key TEXT NOT NULL,
  kind TEXT NOT NULL,              -- photo, certificate, receipt
  is_public INTEGER NOT NULL DEFAULT 0,
  caption TEXT
);

-- 價格紀錄（管理員輸入或 CSV 匯入）
CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  bottle_id TEXT REFERENCES bottles(id),
  price_type TEXT NOT NULL,        -- auction_hammer, auction_total, auction_unsold, dealer_ask, private_sale, msrp
  amount_minor INTEGER,            -- auction_unsold 可為 NULL 或底價
  currency TEXT NOT NULL,
  market TEXT,                     -- HK, TW, UK, US, JP ...
  venue TEXT,                      -- 拍賣行 / 酒商名稱
  lot_number TEXT,
  observed_at TEXT NOT NULL,       -- 成交或觀察日期
  condition_note TEXT,
  source_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE fx_rates (
  rate_date TEXT NOT NULL, base TEXT NOT NULL, quote TEXT NOT NULL, rate REAL NOT NULL,
  PRIMARY KEY (rate_date, base, quote)
);

-- 評分紀錄（每次重算存一份，可重現）
CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  computed_at TEXT NOT NULL,
  status TEXT NOT NULL,            -- scored, insufficient_data, needs_review
  total INTEGER, tier TEXT,        -- A, B, C, low
  trend INTEGER, activity INTEGER, scarcity INTEGER, exit INTEGER, fundamentals INTEGER,
  inputs_json TEXT NOT NULL,       -- 計分所用的價格 id、匯率、新聞 id 及中間值
  algo_version TEXT NOT NULL
);

-- 分享連結
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  bottle_id TEXT REFERENCES bottles(id),
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256(token)，原 token 只在建立時顯示一次
  label TEXT,                      -- 管理員自己的備註（不可填客戶姓名，UI 要提示）
  show_prices INTEGER NOT NULL DEFAULT 1,
  show_score INTEGER NOT NULL DEFAULT 1,
  show_investor_card INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'HKD',
  language TEXT NOT NULL DEFAULT 'zh-Hant',
  expires_at TEXT,
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 系統設定（品牌名、logo、評分常數、出場成本預設值等）
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- 工作紀錄
CREATE TABLE job_logs (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT, items_found INTEGER, items_processed INTEGER, cost_estimate INTEGER, error TEXT
);
```

不記錄任何客戶姓名、聯絡資料或「邊個客人持有邊支酒」。

---

## 4. 模組一：每日全球情報

### 4.1 排程

- Cron：`0 23 * * *` 及 `0 11 * * *`（UTC）= 台北／香港時間 07:00 及 19:00。
- 每日簡報：07:00 那一輪完成後寄出（約 08:00 前）。

### 4.2 流程

1. **收集**：逐個 `is_active` 來源讀 RSS/Atom（`fetch` + 簡單 XML 解析；只取標題、連結、日期、摘要片段，不存全文）。單一來源失敗只記錄 `last_error`，不影響其他來源。
2. **去重**：`canonical_url` 相同即跳過；正規化標題（小寫、去標點、去停用詞）hash 相同、或 72 小時內標題相似度高者，歸入同一 `cluster_id`，只處理一次 AI，頁面列出所有來源。
3. **AI 處理**：每篇（每 cluster）呼叫 Claude 一次，要求嚴格 JSON（見 §4.5）。每輪上限 60 篇，超出的留待下一輪；按來源可靠度及發佈時間排序。
4. **投資者焦點**：由規則決定（§4.3），AI 只負責判斷新聞屬於哪個類別及抽取實體。
5. **配對**：用 `entities.name_en / name_zh / aliases` 對 AI 抽取的實體做配對，寫入 `article_entities`。配對不到的實體名稱記錄下來，在後台提示管理員是否新增。
6. **觸發重算**：有投資者焦點新聞連到某酒廠 / 品牌 → 重算相關 `editions` 的「酒廠基本面」及總分（§6）。
7. **簡報**：組成 email（HTML + 純文字），三段：①影響你追蹤酒款的新聞 ②投資者焦點 ③其他重要消息（importance ≥ 3），每篇一行標題 + 一行摘要 + 連結。

### 4.3 分類及投資者焦點規則

`category`：`auction`、`record_price`、`distillery_closure`（停產／閉廠／封存）、`distillery_reopen`、`acquisition`（收購／易手）、`limited_release`、`new_release`、`market_index`、`regulation_tax`（稅項／關稅／法規）、`fx_trade`、`counterfeit`（假酒／撤拍）、`industry`、`education_history`、`event`。

**`investor_focus = 1` 當且僅當** category ∈ {`auction`, `record_price`, `distillery_closure`, `distillery_reopen`, `acquisition`, `limited_release`, `market_index`, `regulation_tax`, `fx_trade`, `counterfeit`}，或 importance ≥ 4 且連到任何 `is_tracked` 實體。

### 4.4 投資者分析卡（`investor_card_json`）

```json
{
  "affected": [{"entity": "Port Ellen", "direction": 1}],
  "direction": "bullish | bearish | neutral",
  "horizon": "short | long",
  "evidence": ["事實一句（附來源 URL）"],
  "ai_reasoning_zh": "AI 推論，明確標示為推論",
  "ai_reasoning_en": "...",
  "watch_next_zh": "之後要留意甚麼"
}
```

### 4.5 AI 輸出契約

- System prompt 要求：只根據提供的標題、摘要、連結作答；**不可虛構成交價、發售數量、日期**；不知道就填 `null`；事實、來源說法、AI 解讀分開。
- 回應必須是可 `JSON.parse` 的物件，欄位：`title_zh, title_en, summary_zh, summary_en, category, importance (1–5), entities[{name, type}], facts[{text, url}], claims[{text, url}], ai_view_zh, ai_view_en, investor_card (或 null)`。
- 解析失敗 → 重試一次 → 仍失敗則 `status='failed'`，後台可見。
- 記錄 `ai_model`、`prompt_version`、token 用量。
- 模型名稱放在 `settings`，不要寫死；開工時先確認當前可用的 Claude 模型名稱。

### 4.6 新聞來源（候選，需驗證）

第一階段的第一個任務：逐個確認以下候選是否有 **公開 RSS/Atom**、網站條款是否容許讀取 RSS，並把通過的寫入 `sources`（seed migration）。**不可用的就剔除，不要改用爬網頁。** 目標 20–30 個。

| 地區 | 候選 |
|---|---|
| 英國／全球產業 | The Spirits Business、Scotchwhisky.com、Whisky Advocate、WhiskyNotes、Whisky for Everyone、Malt-Review、Dramface、WhiskyCast、The Grocer（烈酒版） |
| 拍賣 | Whisky Auctioneer、Scotch Whisky Auctions、Sotheby's（Wine & Spirits）、Bonhams、Christie's 的新聞／拍賣結果頁（有 RSS 才用） |
| 日本 | Nonjatta 及其他日文威士忌新聞源 |
| 美國 | Breaking Bourbon、Bourbon & Banter、Whisky Advocate（美國部分） |
| 台灣／香港 | 本地烈酒新聞及拍賣行（待管理員提供） |
| 其他 | 愛爾蘭、印度威士忌新聞源 |

管理員可在後台新增／停用來源。

### 4.7 前台：新聞頁（`/`，管理員專用，受 Access 保護）

- 一屏佈局：左側篩選（全部／投資者焦點／影響我的酒；地區；類別；日期），右側新聞卡片列表（分頁，每頁 10–12 張）。
- 頂部固定一行：「影響你手上的酒（N）」。
- 卡片：中文標題、一行摘要、類別及地區標籤、投資者焦點徽章、方向（利好／利淡／中性）、來源數目、時間。撳入顯示詳細：事實、來源說法、AI 解讀（不同底色區分）、投資者分析卡、相關酒款連結、所有原文連結。
- 搜尋框：FTS5。

> 新聞頁不公開，因為 AI 分析是管理員的私人工具。第一版不做公開新聞網站。

---

## 5. 模組二：酒款及價格（後台 `/admin`）

- **酒款版本 CRUD**：欄位見 `editions`。可貼一段英文描述，按「AI 起草」由 Claude 填中英文介紹（管理員確認後才儲存；AI 不可填 edition_size、年份等數字，只可從管理員貼上的文字抽取）。
- **單瓶 CRUD**：每個版本下可加多支單瓶，上載相片／證書到 R2（`is_public` 每張獨立設定）。介面清楚提示「證書或相片不代表已驗證真偽」。
- **價格輸入**：表單 + **CSV 匯入**（欄位與 `prices` 一致；匯入前預覽，錯誤行標紅不匯入）。必須選 `price_type`；`auction_unsold` 用來計流拍率。
- **價格歷史圖**：SVG 線圖，按 price_type 分顏色，可切換顯示幣種（HKD／TWD／原幣），換算用 `observed_at` 當日或之前最近的匯率。
- **酒款列表（類似股票掃描表）**：表頭摘要（追蹤酒款數、已評分、資料不足、待核實），表格欄位：名稱、類別、Tier、總分、五項分數、最近成交（HKD）、12 個月變化、最近新聞日期。可排序、篩選，分頁保持一屏。
- **設定頁**：品牌名、logo（R2）、預設幣種、評分常數、出場成本預設百分比、每日簡報收件地址（只能是已在 Email Routing 驗證的地址）。

---

## 6. 模組三：酒款評分（`src/score.js`，純函數）

**每支酒當一隻股票分析。** 總分 100，研究排序用途，不是買入建議。

### 6.1 計分前置條件

- 只用同一 `edition_id` 的 `auction_total` 及 `private_sale`（成交價）計趨勢；`dealer_ask` 只作參考，不計入趨勢。
- 所有金額換算成 HKD 再計。
- **資料不足**：過去 24 個月同版本成交 < 3 次 → `status='insufficient_data'`，不計總分、不排 Tier、列表顯示「資料不足」。
- **待核實**：版本資料缺少 `bottling_year` 且同名版本多於一個，或價格紀錄容量與版本 `volume_ml` 不符 → `status='needs_review'`。

### 6.2 五項分數（常數全部放 `settings`，以下為預設）

| 項目 | 滿分 | 計法 |
|---|---|---|
| 價格趨勢 | 30 | `t12` = 近 12 個月成交中位數 ÷ 前 12 個月中位數 − 1；`t36` = 近 12 個月中位數 ÷ 25–36 個月前中位數 的年化變化。`t = 0.5·t12 + 0.5·t36`（缺一則用另一個）。年化 −10% → 0 分，+30% → 30 分，中間線性，超出夾住。 |
| 成交活躍度 | 20 | 近 12 個月成交次數 `n`：`min(n, 10) / 10 × 15`；流拍率 `u = unsold / (sold + unsold)`：`(1 − u) × 5`（無流拍紀錄時給 3）。 |
| 稀缺度 | 25 | 限量：≤100 → 12、≤500 → 9、≤2,000 → 6、≤10,000 → 3、未知或以上 → 0；酒廠 `status` 為 closed／mothballed → +8；酒齡 ≥40 → +5、≥25 → +3、≥18 → +1。上限 25。 |
| 出場難度 | 15 | 近 24 個月有成交的不同拍賣行數：≥3 → 6、2 → 4、1 → 2；預計出場成本（設定：賣方佣金 + 運費 + 保險，預設 15%）：≤15% → 9、≤25% → 6、≤35% → 3、以上 → 0。 |
| 酒廠基本面 | 10 | 起點 5。過去 180 日每篇連到該酒廠／品牌的投資者焦點新聞：`direction × importance / 5 × 衰減`，衰減 = `1 − 日數/180`。總和加到 5 上，夾在 0–10。 |

### 6.3 Tier

- A ≥ 75、B 60–74、C 45–59、low < 45。
- 「重點名單」視圖：按總分排序，每個 `category` 最多 10 支。

### 6.4 投資卡（每支酒）

| 欄位 | 來源 |
|---|---|
| 參考買入價 | 近 12 個月成交中位數（HKD），附樣本數 |
| 目標價 | 管理員輸入（`target_price_minor`），AI 不可自行產生 |
| 最低可接受出售價 | 管理員輸入（取代股票的止蝕位，因為威士忌不能即時賣出） |
| 預計持有期 | 管理員輸入 |
| 出場成本 | 設定百分比 × 目標價 |
| 回報風險比（RRR） | `(目標價 − 出場成本 − 參考買入價) ÷ (參考買入價 − 最低可接受出售價)`；分母 ≤ 0 或任何欄位缺失 → 顯示「未能計算」 |

### 6.5 重算時機

- 新增／修改／刪除價格紀錄 → 重算該版本。
- 投資者焦點新聞連到相關實體 → 重算相關版本。
- 每次重算寫一筆 `scores`（含 `inputs_json`、`algo_version`），可完整重現。

### 6.6 測試

`test/score.test.js` 覆蓋：資料不足、只有 t12、只有 t36、限量未知、閉廠加分、衰減、RRR 分母為零、幣種換算。用 Node 內建 `node --test`。

---

## 7. 模組四：客戶分享頁（`/s/:token`，公開）

- 管理員在酒款頁按「建立分享連結」→ 選擇顯示內容（價格、評分、投資卡）、幣種、語言、期限 → 產生 token（`crypto.getRandomValues` 32 bytes → base64url），**只顯示一次**，D1 只存 SHA-256。
- 頁面風格：私人奢侈品型錄。深色或米白高級感、大幅酒瓶相片、襯線標題、大量留白；頂部為管理員的品牌名及 logo。一屏顯示主要資訊，次要資訊用分頁標籤（概覽／價格／相關消息／評語）。
- 內容：版本資料、單瓶瓶況（如有指定單瓶）、公開相片、專業評語、相關新聞（只顯示已發佈的中英摘要及原文連結）、`is_public=1` 的價格紀錄及價格圖、Tier 及簡化評分（不顯示計法細節）、（選擇顯示時）投資卡。
- **永不顯示**：購入成本、私人備註、來源證明（除非該 media `is_public=1`）、`label`。
- 每頁底部固定：「本頁資料僅供市場參考，並非投資建議，不保證任何成交價或回報。」及資料更新日期。
- 回應標頭：`X-Robots-Tag: noindex, nofollow`、`Referrer-Policy: no-referrer`、`Cache-Control: private, no-store`；HTML 加 `<meta name="robots" content="noindex">`。
- 過期或撤銷 → 顯示「此連結已失效」頁（不透露酒款名稱）。
- 列印：print CSS 排成 A4，頁首品牌、頁尾日期及聲明，隱藏互動元素。
- og:image：通用品牌圖（不可在預覽圖洩露酒款或價格）。

---

## 8. 保安要求

- `/admin*`、`/api/admin/*`、`/`（新聞頁）全部由 Cloudflare Access 保護，只容許管理員 email；Worker 內再驗證 Access JWT（`Cf-Access-Jwt-Assertion`，用 Access 的公開金鑰），不通過即 403。
- 只有 `/s/:token`、`/api/share/:token`、靜態資源公開。
- 所有 SQL 用 D1 prepared statements（`bind`），不拼接字串。
- 所有輸出到 HTML 的文字一律轉義（新聞內容來自外部，視為不可信）；AI 回應同樣視為不可信資料。
- 收集新聞只 fetch `sources.feed_url` 內的網址，禁止根據新聞內容去 fetch 其他 URL（防 SSRF）。
- 分享 API 加簡單 rate limit（同一 IP 每分鐘 30 次，用 Workers Rate Limiting binding 或 D1 計數，揀最簡單可行者）。
- R2 檔案不公開 bucket；公開相片經 Worker 檢查 `is_public` 後才回傳。
- Secrets：`ANTHROPIC_API_KEY`、Access team domain／AUD 用 `wrangler secret`，不入 repo。
- 每週自動匯出 D1 備份到 R2（用 Cron，保留最近 8 份）。

---

## 9. 介面設計方向

- 後台：專業投資研究工具感（參考股票掃描表）：深色、資料密度高、表格清晰、數字右對齊。
- 分享頁：奢侈品型錄感，與後台風格分開。
- 兩者都必須有 favicon 及 og:image；手機版可用（分享頁尤其重要，客戶多數用手機開）。
- 一屏原則：用分頁、標籤、篩選代替長捲動。

---

## 10. 成本預算

- Claude API：每日約 50–100 篇候選、處理上限每輪 60 篇，目標每月 HK$100–300；`job_logs` 記錄每輪成本，後台顯示本月累計。
- Cloudflare：Workers、D1、R2、Cron、Access（≤50 用戶免費）應在免費額度內。

---

## 11. 開發階段及驗收

### 第一階段：每日情報（先做，不受未決問題影響）

1. 建立 Worker、D1、wrangler 設定、migrations；寫出 Cloudflare 設定步驟（Worker、D1、Access、Email Routing、secrets）。
2. 驗證並 seed 新聞來源（§4.6）。
3. 收集、去重、AI 處理、投資者焦點規則、實體配對（先 seed 約 100 個主要酒廠／品牌／拍賣行，閉廠酒廠標 `closed`）。
4. 新聞頁（§4.7）、搜尋、後台來源管理、工作紀錄頁。
5. 每日 email 簡報。

**驗收**：連續 3 日自動收集；每篇已發佈新聞都有中英摘要及原文連結；同一事件不重複出現；投資者焦點篩選正確；簡報準時寄出；未登入訪問 `/` 及 `/admin` 被擋。

### 第二階段：酒款、價格及評分

1. 酒款版本、單瓶、相片 CRUD。
2. 價格輸入、CSV 匯入、匯率、價格歷史圖。
3. 評分引擎（§6）+ 測試 + 酒款掃描表。
4. 新聞與酒款連結、「影響你手上的酒」。

**驗收**：`node --test` 全部通過；資料不足的酒顯示「資料不足」而非分數；改一筆價格後分數即時更新；同一輸入重算得出相同結果。

### 第三階段：客戶分享

1. 分享連結建立／撤銷／期限。
2. 分享頁設計（§7）、品牌設定、print CSS。
3. 每週投資者週報（投資者焦點新聞匯總，可列印、可分享）。
4. D1 每週備份。

**驗收**：撤銷後連結即時失效；分享頁原始碼及 API 回應中搜尋不到成本、私人備註；`noindex` 標頭存在；手機一屏顯示主要資訊；列印 A4 排版正常。

---

## 12. 未決問題（第二、三階段開工前由管理員確認）

1. 大約追蹤及推介多少支酒？
2. 現時價格記錄方式（如有 Excel，CSV 欄位要對應）。
3. 客戶主要用港幣還是台幣？
4. 管理實際持有的酒，還是只管理推介酒款？
5. 價格是否包括購入成本及預計售價？
6. 品牌名及 logo（用自己品牌還是 Whisky Today）。
7. 一條私人連結是否足夠，還是需要正式 PDF。
8. 評分權重（30／20／25／15／10）是否合理。
9. 必須收錄的新聞網站或拍賣行。

未有答案前，按本文件預設值開發，並把相關常數放在 `settings` 方便之後修改。
