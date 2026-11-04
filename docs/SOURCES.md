# 新聞來源驗證紀錄（2026-11-04）

做法：用程式逐個讀取候選 RSS/Atom（User-Agent `WhiskyTodayFeedCheck/1.0`），確認回應係 RSS/Atom、有項目、最近半年有更新。只讀標題、連結、日期、摘要片段，不存全文。

## 通過（22 個，已寫入 `migrations/0002_sources.sql`）

| 來源 | 地區 | 類型 | 備註 |
|---|---|---|---|
| WhiskyNotes | 蘇格蘭 | blog | |
| Whisky for Everyone | 蘇格蘭 | blog | 用 Blogspot feed（主站 feed 回 403） |
| WhiskyCast | 全球 | news | |
| Whisky Intelligence | 蘇格蘭 | news | |
| Rare Whisky 101 | 蘇格蘭 | news | 更新較疏，但有市場指數 |
| Whisky and Wisdom | 蘇格蘭 | blog | |
| A Scot on Scotch | 蘇格蘭 | blog | |
| Irish Whiskey Magazine | 愛爾蘭 | news | |
| Whisky Magazine Japan | 日本 | news | 日文 |
| The Whiskey Wash | 美國 | news | |
| Bourbon & Banter | 美國 | blog | |
| The Whiskey Reviewer | 美國 | blog | |
| The Whiskey Shelf | 美國 | blog | |
| Whiskeybon | 美國 | blog | |
| VinePair（Whiskey 標籤） | 美國 | news | 只讀 whiskey 標籤 feed |
| Distilled Spirits Council（DISCUS） | 美國 | official | 關稅、法規 |
| The Daily Pour | 美國 | news | 關鍵字過濾 |
| BevNET（Spirits） | 美國 | news | 關鍵字過濾 |
| Just Drinks（Spirits） | 全球 | news | 關鍵字過濾；收購、業績 |
| Drinks International | 全球 | news | 關鍵字過濾 |
| Drinks Retailing News | 英國 | news | 關鍵字過濾 |
| Bonhams 新聞稿 | 全球 | auction | 關鍵字過濾，只留威士忌／烈酒拍賣 |

「關鍵字過濾」= 綜合酒類來源，只有標題或摘要含威士忌相關字眼先會交俾 AI，慳成本。

## 剔除

| 候選 | 原因 |
|---|---|
| The Spirits Business | feed 網址轉去首頁，冇 RSS |
| Scotchwhisky.com | RSS 存在但冇任何項目 |
| Whisky Advocate | 冇 RSS（404） |
| Dramface | 冇 RSS（404） |
| Malt-Review | 自 2025-11 冇更新 |
| The Grocer | RSS 冇項目 |
| Whisky Auctioneer、Scotch Whisky Auctions | 冇 RSS |
| Sotheby's、Christie's | 冇 RSS |
| Nonjatta | 網站連唔到 |
| Breaking Bourbon | 冇 RSS（404） |
| The Drinks Business | RSS 拒絕程式讀取（403） |
| Whisky Magazine（英文版） | 冇 RSS（404） |
| Fred Minnick | 連線逾時 |
| Master of Malt blog | 拒絕程式讀取（429） |
| WhiskyStats、Whiskybase | 拒絕程式讀取（403） |

## 仍欠

- **台灣／香港**：未搵到有公開 RSS 嘅本地烈酒新聞或拍賣行，等管理員提供名單（PLAN §4.6）。
- **日本**：只得 Whisky Magazine Japan 一個。
- **印度**：候選網站全部連唔到。
- **網站條款**：以上全部係網站自己公開提供嘅 RSS，我哋只讀標題、連結、摘要片段；未逐個網站讀晒使用條款全文。管理員如知道某網站唔准，可喺後台停用。
