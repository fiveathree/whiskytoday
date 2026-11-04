# Whisky Today 上線步驟（第一階段）

> 寫於 2026-11-04，介面名稱按當日 Cloudflare 官方文件。如果你見到嘅畫面同下面唔同，截圖俾 Claude 睇，唔好估住撳。

## 開始之前要知道嘅兩件事

1. **要用 Cloudflare Workers Paid（每月 US$5）**
   免費版每次執行只准 10 毫秒 CPU、50 個對外連線；我哋每次收集要讀 22 個新聞來源再叫 AI 處理最多 60 篇，一定超出。寄 email（Email Service）亦只限付費版。
2. **寄每日簡報要有一個放咗喺 Cloudflare 嘅網域**（例如 `yourname.com`），因為寄件人地址一定要係你自己網域。冇網域都可以先上線，只係簡報寄唔到，其他功能照用。

---

## 步驟 1：登入 wrangler（只做一次）

喺 Claude Code 嘅 Terminal 打：

```bash
npx wrangler login
```

瀏覽器會彈出 Cloudflare 頁面，撳 **Allow**。完成後話俾 Claude 知，以下步驟 2、3 可以由 Claude 代你喺 Terminal 做。

## 步驟 2：升級 Workers Paid

1. 打開 https://dash.cloudflare.com ，左邊撳 **Workers & Pages**。
2. 撳 **Plans**（或頁面上「Upgrade」字樣嘅掣），揀 **Workers Paid**，按指示付款。

（呢步涉及付款，一定要你自己做。）

## 步驟 3：建立資料庫及部署（Claude 可代做）

```bash
npx wrangler d1 create whiskytoday
```

畫面會顯示一個 `database_id`，抄入 `wrangler.toml` 嘅 `REPLACE_WITH_D1_DATABASE_ID`。然後：

```bash
npx wrangler d1 migrations apply whiskytoday --remote
```

```bash
npx wrangler deploy
```

部署完會見到網址，例如 `https://whiskytoday.<你嘅帳戶>.workers.dev`。**呢個時候未設定登入，任何人打開都只會見到 Forbidden，係正常嘅。**

## 步驟 4：開 Cloudflare Access（只准指定 email 入）

1. https://dash.cloudflare.com → 左邊 **Workers & Pages** → 撳 **whiskytoday**。
2. 上面揀 **Access** 分頁（如果冇呢個分頁，就去 **Settings** → **Domains & Routes**）。
3. 喺 `workers.dev` 嗰行撳 **Enable Cloudflare Access**。
4. 「Choose who can sign in」揀 **Email**，逐個加入：你自己（Admin）同所有 Viewer 嘅 email。撳 **Save**。
5. 之後要加 Viewer：同一位置撳 **Manage Cloudflare Access**，喺政策入面加 email 就得，唔使改程式。

### 4a. 抄兩個值俾 Worker

- **Team domain**：dash 左邊 **Zero Trust** → **Settings** → 見到 **Team domain**，樣子係 `xxxx.cloudflareaccess.com`。
- **AUD**：**Zero Trust** → **Access controls** → **Applications** → 撳 whiskytoday 嗰個 → 搵 **Application Audience (AUD) Tag**，撳旁邊複製。

## 步驟 5：輸入密碼類設定（你自己喺 Terminal 打）

每行打完會叫你貼上數值，貼完撳 Enter。**呢啲數值唔好貼喺對話入面。**

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
```
貼：`xxxx.cloudflareaccess.com`（唔使 https://）

```bash
npx wrangler secret put ACCESS_AUD
```
貼：步驟 4a 嘅 AUD

```bash
npx wrangler secret put ADMIN_EMAILS
```
貼：Admin 嘅 email（多過一個用逗號分隔）。其他通過 Access 嘅人自動當 Viewer。

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```
貼：Claude API key（去 https://platform.claude.com → **API Keys** → **Create Key**）。

## 步驟 6：每日 email 簡報（有網域先做）

1. dash 左邊 **Email** → **Email Service**，按指示加入你嘅網域（Onboard domain），等佢顯示已驗證。
2. 同一位置 **Email Routing** → **Destination addresses** → 加入收簡報嘅 email，去信箱撳確認連結。
3. Terminal：

```bash
npx wrangler secret put DIGEST_TO
```
貼：收簡報嘅 email（第 2 步驗證咗嗰個）

```bash
npx wrangler secret put DIGEST_FROM
```
貼：寄件地址，例如 `briefing@你嘅網域.com`

## 步驟 7：試一次

1. 打開網址，用 Access 嘅 email 登入（佢會寄一次性密碼俾你）。
2. 撳上面 **後台** → **工作紀錄** → **立即收集新聞**。等 3–5 分鐘重新整理，應見到「收集新聞 ok」，返去 **每日情報** 見到新聞。
3. **追蹤酒廠／品牌** 分頁打剔你手上酒款嘅酒廠，「影響你追蹤的酒」就會開始計。
4. 有網域嘅話撳 **寄出今日簡報** 試寄。

之後每日 07:00 同 19:00（香港／台北時間）自動收集，07:00 嗰輪完成後寄簡報。

---

## 驗收清單（PLAN §11 第一階段）

- [ ] 連續 3 日自動收集（睇後台工作紀錄）
- [ ] 每篇已發佈新聞有中英摘要及原文連結
- [ ] 同一事件唔重複出現（詳細頁「來源」分頁列晒多個來源）
- [ ] 投資者焦點篩選正確
- [ ] 簡報準時寄出
- [ ] 未登入打開 `/` 同 `/admin` 被擋
- [ ] Viewer 睇到新聞，但開 `/admin` 同寫入 API 得 403
