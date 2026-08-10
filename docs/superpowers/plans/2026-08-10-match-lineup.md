# 賽程顯示每場出賽選手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 8/20 比賽計分頁的賽程每列顯示雙方隊名與該場出賽的兩位選手，並把抽籤後的隊名掛進資料庫。

**Architecture:** `tournament_matches` 增加 `players_a` / `players_b` 兩個 jsonb 欄位，由一份冪等可重跑的 SQL 從試算表灌入；`tournament_public_payload` 多輸出 `playersA` / `playersB`；前端 `renderSchedule` 每列由單排改為上下兩排，下排左右對稱。名單為空時一律退回現況版面。

**Tech Stack:** 原生 JavaScript（無建置流程）、Supabase Postgres RPC、jest + jest-environment-jsdom、GitHub Pages、Service Worker 快取。

## Global Constraints

- 介面文字一律繁體中文。
- 無建置流程：直接編輯檔案，不新增任何相依套件。
- `npm test` 以 `TZ=America/Los_Angeles` 執行（設定在 package.json，勿更動）。
- 顯示的選手名一律用試算表的**暱稱**，不使用本名。
- 名單為空（`[]`）時該側只顯示隊名，版面等同改版前——任何情況下不得空白或報錯。
- 不動排名計算（`standings.js`）、輸分狀態機（`tournament_report_score`）、RLS 政策。
- 前端檔案異動後必須 bump `sw.js` 的 `CACHE_NAME`。
- 分支 `match-lineup`，設計依據 `docs/superpowers/specs/2026-08-10-match-lineup-design.md`。

## 字母與隊名對應（已四項校驗通過，見 spec）

| 字母 | 隊名 | seed 分隊 |
|---|---|---|
| A | 羽林萌主 | 分隊 4 |
| B | 綠鯉魚與驢 | 分隊 1 |
| C | 忠男的嘍囉們 | 分隊 3 |
| D | 拍謝阮冠軍 | 分隊 2 |
| E | 翰林小羽E | 分隊 5 |

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `js/tournament-form.js` | 修改 | 新增純函式 `formatLineup`（該檔已是計分頁純函式集散地） |
| `tests/tournament-form.test.js` | 修改 | `formatLineup` 的單元測試 |
| `docs/tournament/lineup-schema-2026-08-20.sql` | 新建 | schema 變更與 RPC 更新，只需執行一次 |
| `docs/tournament/lineup-2026-08-20.sql` | 新建 | 隊名、名冊、30 場出賽名單，冪等可重跑 |
| `js/tournament.js` | 修改 | `renderSchedule` 兩排版面、`openReportForm` 補我方選手 |
| `css/tournament.css` | 修改 | 移除 `.match-teams`，新增兩排版面樣式 |
| `tournament.html` | 修改 | 輸分彈窗新增一個 `<p>` 容器 |
| `sw.js` | 修改 | bump `CACHE_NAME` |
| `CLAUDE.md`、`docs/tournament/賽前作業.md` | 修改 | 記錄新功能與待辦狀態 |

**為何隊名 update 不沿用 `seed-2026-08-20.sql` 的五段**：該檔整體標記為「請勿重跑」（DO 區塊無存在性檢查），在其中挑段落執行有誤觸風險，且那五段需手動替換 `<字母>`。改由新檔 `lineup-2026-08-20.sql` 一併處理，字母已填妥且可重跑。

**關於行號**：各 Task 標註的行號皆為**開工前**的位置。前一個 Task 插入程式碼後行號會位移，
因此每個步驟都同時給了要定位的程式碼原文——以原文為準，行號僅供快速尋找。

---

### Task 1: `formatLineup` 純函式

**Files:**
- Modify: `js/tournament-form.js`（檔尾 `module.exports` 前後）
- Test: `tests/tournament-form.test.js`

**Interfaces:**
- Consumes: 無
- Produces: `formatLineup(players: Array<{name: string}> | undefined) => string`
  — 以 `・`（U+30FB）相接；非陣列、空陣列、無有效 name 時回 `''`。
  Task 4 與 Task 5 都會呼叫它。

- [ ] **Step 1: 寫失敗測試**

先把 `tests/tournament-form.test.js` 第 1 行的 require 改為：

```js
const { parseTokenFromUrl, validateScores, matchState, formatLineup } = require('../js/tournament-form');
```

再於檔尾追加：

```js
describe('formatLineup', () => {
  test('兩位選手以・相接', () => {
    expect(formatLineup([{ name: '小悠' }, { name: '雨彤' }])).toBe('小悠・雨彤');
  });

  test('單一選手直接回傳名字', () => {
    expect(formatLineup([{ name: 'Alan' }])).toBe('Alan');
  });

  test('三位以上全部列出', () => {
    expect(formatLineup([{ name: '甲' }, { name: '乙' }, { name: '丙' }])).toBe('甲・乙・丙');
  });

  test('空陣列回空字串', () => {
    expect(formatLineup([])).toBe('');
  });

  test('undefined 回空字串（RPC 尚未更新時的情況）', () => {
    expect(formatLineup(undefined)).toBe('');
  });

  test('非陣列回空字串（人為誤植）', () => {
    expect(formatLineup({ name: '小悠' })).toBe('');
  });

  test('略過沒有 name 的項目', () => {
    expect(formatLineup([{ name: '小悠' }, {}, { name: '雨彤' }])).toBe('小悠・雨彤');
  });

  test('名字前後空白會被去除', () => {
    expect(formatLineup([{ name: ' 小悠 ' }, { name: '雨彤' }])).toBe('小悠・雨彤');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx jest tests/tournament-form.test.js -t formatLineup`
Expected: FAIL，訊息為 `formatLineup is not defined` 或 `formatLineup is not a function`

- [ ] **Step 3: 實作**

在 `js/tournament-form.js` 的 `matchState` 之後、`module.exports` 之前插入：

```js
// 出賽選手名單格式化：[{name:'小悠'},{name:'雨彤'}] → '小悠・雨彤'
// 名單缺漏或格式不符時一律回空字串，呼叫端據此退回「只顯示隊名」的版面
function formatLineup(players) {
  if (!Array.isArray(players)) return '';
  return players
    .map((p) => (p && typeof p.name === 'string' ? p.name.trim() : ''))
    .filter((n) => n !== '')
    .join('・');
}
```

並把檔尾 export 改為：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseTokenFromUrl, validateScores, matchState, formatLineup };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS，套件數與測項數皆比先前增加

- [ ] **Step 5: 補 payload 透傳測試**

`tournament-api.js` 是 RPC 的薄封裝，Task 2 會讓 payload 多出兩個 key。
在 `tests/tournament-api.test.js` 檔尾追加，確認薄封裝不會漏掉新欄位：

```js
test('fetchPublicView：payload 的 playersA / playersB 原樣透傳', async () => {
  const payload = {
    tournament: { name: '第三屆翰林匹克羽球運動會', heldOn: '2026-08-20', status: 'active' },
    teams: [{ id: 't1', name: '羽林萌主', players: [] }],
    matches: [{
      id: 'm1', roundNo: 1, courtNo: 2, event: '男雙',
      teamAId: 't1', teamBId: 't2',
      playersA: [{ name: '宏彬' }, { name: '彥呈' }],
      playersB: [{ name: 'Alan' }, { name: '威任' }],
      status: 'pending', scoreA: null, scoreB: null,
    }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  const view = await api.fetchPublicView('pub');
  expect(view.matches[0].playersA).toEqual([{ name: '宏彬' }, { name: '彥呈' }]);
  expect(view.matches[0].playersB).toEqual([{ name: 'Alan' }, { name: '威任' }]);
});
```

- [ ] **Step 6: 執行全部測試**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add js/tournament-form.js tests/tournament-form.test.js tests/tournament-api.test.js
git commit -m "feat(lineup): 新增 formatLineup 純函式與 payload 透傳測試"
```

---

### Task 2: 資料庫 schema 與 RPC

**Files:**
- Create: `docs/tournament/lineup-schema-2026-08-20.sql`

**Interfaces:**
- Consumes: 無
- Produces: `tournament_matches.players_a` / `players_b`（jsonb，預設 `'[]'`）；
  `tournament_public_payload` 回傳的 matches 物件新增 `playersA` / `playersB` 兩個 key。
  Task 3 寫入這兩個欄位，Task 4／5 讀取這兩個 key。

本任務只產出 SQL 檔，實際執行由人在 Supabase SQL editor 進行（見 Task 6 的上線清單）。

- [ ] **Step 1: 建立 SQL 檔**

建立 `docs/tournament/lineup-schema-2026-08-20.sql`：

```sql
-- 出賽選手功能：schema 變更與 RPC 更新
-- 在 v2 Supabase SQL editor 執行。可安全重跑（add column if not exists / create or replace）。
--
-- 執行順序：本檔 → lineup-2026-08-20.sql → 前端部署
-- 本檔執行後、資料尚未灌入前，畫面完全不受影響（兩欄預設 '[]'）。

-- 1) 每場雙方出賽選手。格式比照 tournament_teams.players：[{"name":"小悠"},{"name":"雨彤"}]
alter table tournament_matches
  add column if not exists players_a jsonb not null default '[]'::jsonb,
  add column if not exists players_b jsonb not null default '[]'::jsonb;

-- 2) 公開 payload 多吐 playersA / playersB
--    僅新增兩個 key，函式簽章與其餘欄位一字未動；
--    舊版前端收到多餘 key 不受影響，故可先上本檔、稍後再部署前端。
create or replace function tournament_public_payload(p_tournament uuid)
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tournament', (
      select jsonb_build_object('name', t.name, 'heldOn', t.held_on, 'status', t.status)
      from tournaments t where t.id = p_tournament
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', tm.id, 'name', tm.name, 'players', tm.players)
                       order by tm.created_at)
      from tournament_teams tm where tm.tournament_id = p_tournament
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'roundNo', m.round_no, 'timeSlot', m.time_slot, 'courtNo', m.court_no,
        'event', m.event, 'teamAId', m.team_a_id, 'teamBId', m.team_b_id,
        'playersA', m.players_a, 'playersB', m.players_b,
        'status', m.status, 'scoreA', m.score_a, 'scoreB', m.score_b)
        order by m.round_no, m.court_no)
      from tournament_matches m where m.tournament_id = p_tournament
    ), '[]'::jsonb)
  );
$$;

-- 3) 核對：應回 30 列，players_a / players_b 此時皆為 []
select round_no, court_no, event, players_a, players_b
from tournament_matches
where tournament_id = (select id from tournaments
                       where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
order by round_no, court_no;
```

- [ ] **Step 2: 檢查函式全文與線上版本一致**

比對本檔 `tournament_public_payload` 與 `docs/tournament/v2-schema-bootstrap.sql` 中的原始定義，
確認除了新增的 `'playersA', m.players_a, 'playersB', m.players_b` 一行之外**逐字相同**。
`create or replace` 是整體覆寫，任何遺漏都會弄丟原有欄位。

Run: `diff <(sed -n '/^create or replace function tournament_public_payload/,/^\$\$;/p' docs/tournament/v2-schema-bootstrap.sql) <(sed -n '/^create or replace function tournament_public_payload/,/^\$\$;/p' docs/tournament/lineup-schema-2026-08-20.sql)`
Expected: 僅有一處新增行的差異，無任何刪除或修改行

- [ ] **Step 3: Commit**

```bash
git add docs/tournament/lineup-schema-2026-08-20.sql
git commit -m "feat(lineup): tournament_matches 增出賽選手欄位與 RPC 更新 SQL"
```

---

### Task 3: 灌入隊名、名冊與 30 場出賽名單

**Files:**
- Create: `docs/tournament/lineup-2026-08-20.sql`

**Interfaces:**
- Consumes: Task 2 建立的 `players_a` / `players_b` 欄位
- Produces: 資料庫中 5 隊的正式隊名與名冊、30 場的出賽選手資料

資料來源為試算表「總賽程表(含出賽選手)」與「等級校正與分組」，已於 spec 記錄四項校驗全數通過。

- [ ] **Step 1: 建立 SQL 檔**

建立 `docs/tournament/lineup-2026-08-20.sql`：

```sql
-- 8/20 第三屆羽球賽：隊名、名冊與 30 場出賽選手
-- 在 v2 Supabase SQL editor 執行。前置：先跑 lineup-schema-2026-08-20.sql
--
-- ✅ 本檔可安全重跑：全為 update，無 insert，重跑只是把同樣的值再寫一次。
--    試算表日後有異動，改完重跑本檔即可同步。
--    （與 seed-2026-08-20.sql 不同，該檔的 DO 區塊重跑會建出重複比賽。）
--
-- 資料來源：試算表「總賽程表(含出賽選手)」（暱稱）、「等級校正與分組」（本名名冊）
-- 字母對應以四項校驗確認，見 docs/superpowers/specs/2026-08-10-match-lineup-design.md

-- ============================================================
-- 1) 隊名與整隊名冊
--    name 條件寫成 in (字母, 正式隊名)，所以第二次執行仍匹配得到。
--    players 存本名（沿用 seed 的分隊名冊），前端不顯示，僅作正式紀錄。
-- ============================================================
update tournament_teams tm set
  name = v.team_name,
  players = v.players::jsonb
from (values
  ('A', '羽林萌主',
   '[{"name":"傅敬軒"},{"name":"郭彥呈"},{"name":"廖宏彬"},{"name":"呂孟娜"},{"name":"蔡依玲"}]'),
  ('B', '綠鯉魚與驢',
   '[{"name":"邱奕鈞"},{"name":"陳奕廷"},{"name":"高新翰"},{"name":"陳怡伶"},{"name":"劉凡瑀"},{"name":"洪蘭萍"}]'),
  ('C', '忠男的嘍囉們',
   '[{"name":"賴忠男"},{"name":"林丞輊"},{"name":"李俊寬"},{"name":"楊皓婷"},{"name":"柳雨彤"},{"name":"吳玉婷"}]'),
  ('D', '拍謝阮冠軍',
   '[{"name":"曾偉哲"},{"name":"吳萬萊"},{"name":"陳彥文"},{"name":"劉杰妮"},{"name":"林玉珠"},{"name":"湯庭禎"}]'),
  ('E', '翰林小羽E',
   '[{"name":"廖翊凱"},{"name":"陳威任"},{"name":"黃迺芸"},{"name":"洪于婷"},{"name":"謝郁嫺"}]')
) as v(letter, team_name, players)
where tm.tournament_id = (select id from tournaments
                          where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and tm.name in (v.letter, v.team_name);

-- ============================================================
-- 2) 30 場出賽選手（暱稱）
--    以 (round_no, court_no) 為 key。左欄 = team_a、右欄 = team_b，
--    順序與試算表兩張分頁一致，已逐場比對 seed 的字母組合無誤。
-- ============================================================
update tournament_matches m set
  players_a = v.pa::jsonb,
  players_b = v.pb::jsonb
from (values
  ( 1, 1, '[{"name":"小悠"},{"name":"雨彤"}]',     '[{"name":"庭禎"},{"name":"杰妮"}]'),
  ( 1, 2, '[{"name":"宏彬"},{"name":"彥呈"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  ( 1, 3, '[{"name":"孟娜"},{"name":"敬軒"}]',     '[{"name":"凡瑀"},{"name":"奕鈞"}]'),
  ( 2, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"Dora"},{"name":"蘭萍"}]'),
  ( 2, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"忠男"},{"name":"俊寬"}]'),
  ( 2, 3, '[{"name":"Rex"},{"name":"玉珠"}]',      '[{"name":"威任"},{"name":"小于"}]'),
  ( 3, 1, '[{"name":"小悠"},{"name":"雨彤"}]',     '[{"name":"迺芸"},{"name":"小于"}]'),
  ( 3, 2, '[{"name":"宏彬"},{"name":"敬軒"}]',     '[{"name":"偉哲"},{"name":"Rex"}]'),
  ( 3, 3, '[{"name":"凡瑀"},{"name":"奕鈞"}]',     '[{"name":"Irene"},{"name":"阿輊"}]'),
  ( 4, 1, '[{"name":"Dora"},{"name":"蘭萍"}]',     '[{"name":"庭禎"},{"name":"玉珠"}]'),
  ( 4, 2, '[{"name":"忠男"},{"name":"阿輊"}]',     '[{"name":"偉哲"},{"name":"萬萊"}]'),
  ( 4, 3, '[{"name":"Anita"},{"name":"彥呈"}]',    '[{"name":"Alan"},{"name":"郁嫺"}]'),
  ( 5, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"迺芸"},{"name":"小于"}]'),
  ( 5, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"Alan"},{"name":"威任"}]'),
  ( 5, 3, '[{"name":"雨彤"},{"name":"俊寬"}]',     '[{"name":"萬萊"},{"name":"杰妮"}]'),
  ( 6, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"杰妮"},{"name":"玉珠"}]'),
  ( 6, 2, '[{"name":"宏彬"},{"name":"敬軒"}]',     '[{"name":"忠男"},{"name":"阿輊"}]'),
  ( 6, 3, '[{"name":"蘭萍"},{"name":"奕鈞"}]',     '[{"name":"威任"},{"name":"郁嫺"}]'),
  ( 7, 1, '[{"name":"Dora"},{"name":"凡瑀"}]',     '[{"name":"迺芸"},{"name":"郁嫺"}]'),
  ( 7, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"萬萊"},{"name":"Rex"}]'),
  ( 7, 3, '[{"name":"孟娜"},{"name":"彥呈"}]',     '[{"name":"Irene"},{"name":"俊寬"}]'),
  ( 8, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"Irene"},{"name":"雨彤"}]'),
  ( 8, 2, '[{"name":"阿輊"},{"name":"俊寬"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  ( 8, 3, '[{"name":"蘭萍"},{"name":"奕鈞"}]',     '[{"name":"偉哲"},{"name":"庭禎"}]'),
  ( 9, 1, '[{"name":"庭禎"},{"name":"玉珠"}]',     '[{"name":"迺芸"},{"name":"郁嫺"}]'),
  ( 9, 2, '[{"name":"宏彬"},{"name":"彥呈"}]',     '[{"name":"Eating"},{"name":"新翰"}]'),
  ( 9, 3, '[{"name":"忠男"},{"name":"小悠"}]',     '[{"name":"Alan"},{"name":"小于"}]'),
  (10, 1, '[{"name":"Dora"},{"name":"凡瑀"}]',     '[{"name":"小悠"},{"name":"Irene"}]'),
  (10, 2, '[{"name":"偉哲"},{"name":"萬萊"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  (10, 3, '[{"name":"Anita"},{"name":"敬軒"}]',    '[{"name":"Rex"},{"name":"杰妮"}]')
) as v(round_no, court_no, pa, pb)
where m.tournament_id = (select id from tournaments
                         where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and m.round_no = v.round_no and m.court_no = v.court_no;

-- ============================================================
-- 3) 核對查詢（純 select，可安全重跑）
-- ============================================================

-- 3a) 五隊隊名與人數：應為 羽林萌主 5、綠鯉魚與驢 6、忠男的嘍囉們 6、拍謝阮冠軍 6、翰林小羽E 5
select tm.name, jsonb_array_length(tm.players) as 人數
from tournament_teams tm
where tm.tournament_id = (select id from tournaments
                          where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
order by tm.created_at;

-- 3b) 30 場對戰與出賽選手：逐列與試算表比對
select m.round_no, m.court_no, m.event,
       ta.name as team_a,
       (select string_agg(x->>'name', '・') from jsonb_array_elements(m.players_a) x) as 選手_a,
       tb.name as team_b,
       (select string_agg(x->>'name', '・') from jsonb_array_elements(m.players_b) x) as 選手_b
from tournament_matches m
join tournament_teams ta on ta.id = m.team_a_id
join tournament_teams tb on tb.id = m.team_b_id
where m.tournament_id = (select id from tournaments
                         where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
order by m.round_no, m.court_no;

-- 3c) 沒灌到的場次：應回 0 列
select round_no, court_no
from tournament_matches
where tournament_id = (select id from tournaments
                       where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and (jsonb_array_length(players_a) <> 2 or jsonb_array_length(players_b) <> 2)
order by round_no, court_no;
```

- [ ] **Step 2: 靜態檢查 30 列資料**

不連資料庫，先確認檔案本身的完整性：

Run: `grep -cE "^  \( ?[0-9]+, [0-9], " docs/tournament/lineup-2026-08-20.sql`
Expected: `30`

Run: `grep -oE "\( ?[0-9]+, [0-9]," docs/tournament/lineup-2026-08-20.sql | sort | uniq -d`
Expected: 無輸出（沒有重複的 round/court 組合）

- [ ] **Step 3: Commit**

```bash
git add docs/tournament/lineup-2026-08-20.sql
git commit -m "feat(lineup): 隊名、名冊與 30 場出賽選手的可重跑 SQL"
```

---

### Task 4: 賽程列改為左右對稱兩排

**Files:**
- Modify: `js/tournament.js:127-205`（`renderSchedule`）
- Modify: `css/tournament.css:216-280`（`.match-row` 起至 `.match-score` 止）

**Interfaces:**
- Consumes: `formatLineup`（Task 1）；payload 的 `match.playersA` / `match.playersB`（Task 2）
- Produces: `makeSide(teamId, players, names, colors, isRight) => HTMLSpanElement`
  — 供 `renderSchedule` 內部使用，不對外

- [ ] **Step 1: 新增 `makeSide` 輔助函式**

在 `js/tournament.js` 的 `makeTeamDot`（第 34-39 行）之後插入：

```js
// 賽程列的一側：隊名一行、出賽選手一行。isRight 決定色點在隊名的哪一邊與對齊方向
function makeSide(teamId, players, names, colors, isRight) {
  const side = document.createElement('span');
  side.className = isRight ? 'match-side right' : 'match-side';

  const teamLine = document.createElement('span');
  teamLine.className = 'side-team';
  const nameEl = document.createElement('span');
  nameEl.textContent = names[teamId];
  if (isRight) {
    teamLine.appendChild(nameEl);
    teamLine.appendChild(makeTeamDot(colors[teamId]));
  } else {
    teamLine.appendChild(makeTeamDot(colors[teamId]));
    teamLine.appendChild(nameEl);
  }
  side.appendChild(teamLine);

  // 名單為空（未灌資料、或 RPC 尚未更新）就不加這一行，版面等同改版前
  const lineup = formatLineup(players);
  if (lineup) {
    const playersEl = document.createElement('span');
    playersEl.className = 'side-players';
    playersEl.textContent = lineup;
    side.appendChild(playersEl);
  }
  return side;
}
```

- [ ] **Step 2: 改寫 `renderSchedule` 的列組裝**

將 `js/tournament.js` 中從 `const chip = document.createElement('span');`（第 168 行）
到 `row.appendChild(result);`（第 194 行）整段，替換為：

```js
      // 上排：賽點 chip 靠左、比分與狀態靠右
      const head = document.createElement('span');
      head.className = 'match-head';

      const chip = document.createElement('span');
      chip.className = `event-chip ${match.event}`;
      chip.textContent = `場地${match.courtNo}　${match.event}`;
      head.appendChild(chip);

      const result = document.createElement('span');
      result.className = 'match-result';
      if (match.status === 'confirmed') {
        const score = document.createElement('span');
        score.className = 'match-score';
        score.textContent = `${match.scoreA}：${match.scoreB}`;
        result.appendChild(score);
      }
      const label = document.createElement('span');
      label.className = `state-label ${state.cssClass}`;
      label.textContent = state.label;
      result.appendChild(label);
      head.appendChild(result);
      row.appendChild(head);

      // 下排：兩隊各佔一半，選手緊貼自己的隊名下方
      const body = document.createElement('span');
      body.className = 'match-body';
      body.appendChild(makeSide(match.teamAId, match.playersA, names, colors, false));
      const vs = document.createElement('span');
      vs.className = 'match-vs';
      vs.textContent = 'vs';
      body.appendChild(vs);
      body.appendChild(makeSide(match.teamBId, match.playersB, names, colors, true));
      row.appendChild(body);
```

其餘部分（`state`、`isMine`、`row` 的 class 設定、`seenConfirmed` 邏輯、
`state.canReport` 的 click 綁定、`card.appendChild(row)`）**保持原樣不動**。

- [ ] **Step 3: 更新樣式**

在 `css/tournament.css` 中，將 `.match-row` 的 `display: flex;` 改為 `display: block;`
並移除該規則的 `align-items` 與 `gap`：

```css
.match-row {
  display: block;
  padding: 0.7rem 0.9rem;
  border-top: 1px solid var(--f1-line);
  transition: background-color var(--f1-ease);
}
```

刪除 `.match-teams` 與 `.match-teams .team-dot:last-child` 兩條規則（已無使用者），
並在 `.event-chip.混雙` 之後新增：

```css
/* 賽程列上排：賽點靠左、比分與狀態靠右 */
.match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  margin-bottom: 0.45rem;
}

/* 賽程列下排：兩隊左右對稱，選手在自己隊名正下方 */
.match-body {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.match-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.match-side.right {
  align-items: flex-end;
  text-align: right;
}

.side-team {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--f1-fg);
}

/* .team-dot 自帶 margin-right 供 standings 表使用，這裡改用 gap 控制間距 */
.side-team .team-dot { margin-right: 0; }

.side-players {
  font-size: 0.8rem;
  color: var(--f1-fg-muted);
}

.match-vs {
  flex: none;
  font-size: 0.72rem;
  color: var(--f1-fg-faint);
  padding-top: 0.15rem;
}
```

將 `.match-result` 與 `.match-score` 改為並排（原本 `.match-score` 是 `display: block`，
在新版上排會多佔一行）：

```css
.match-result {
  flex: none;
  text-align: right;
  font-size: 0.78rem;
  white-space: nowrap;
}

.match-score {
  display: inline;
  margin-right: 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--f1-fg);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: 確認既有測試未受影響**

Run: `npm test`
Expected: 全部 PASS（本任務不動純函式，測項數應與 Task 1 完成後相同）

- [ ] **Step 5: 瀏覽器驗證**

啟動靜態伺服器（`python3 -m http.server 8000`），以觀賽 token 開啟
`http://localhost:8000/tournament.html?t=<public_token>`，逐項確認：

1. 30 場皆顯示雙方隊名與各兩位選手
2. 最長的隊名「忠男的嘍囉們」在 375px 寬度不破版、不逐字直排
3. 已確認場次的比分與「已確認」在同一行、靠右
4. 桌機寬度下版面正常

若資料庫尚未執行 Task 2／3 的 SQL，此時應看到「只有隊名、無選手行」——
這正是空名單的預期行為，不算失敗。

- [ ] **Step 6: Commit**

```bash
git add js/tournament.js css/tournament.css
git commit -m "feat(lineup): 賽程列改為左右對稱兩排，顯示每場出賽選手"
```

---

### Task 5: 輸分彈窗顯示本場我方選手

**Files:**
- Modify: `tournament.html:41`（`reportSubtitle` 之後）
- Modify: `js/tournament.js:235-263`（`openReportForm`）
- Modify: `css/tournament.css:352-357`（`.report-subtitle` 之後）

**Interfaces:**
- Consumes: `formatLineup`（Task 1）；`match.playersA` / `match.playersB`（Task 2）
- Produces: 無

- [ ] **Step 1: 新增彈窗容器**

在 `tournament.html` 的 `<p id="reportSubtitle" class="report-subtitle"></p>` 之後插入：

```html
            <p id="reportLineup" class="report-lineup" hidden></p>
```

- [ ] **Step 2: 在 `openReportForm` 填入我方選手**

在 `js/tournament.js` 的 `openReportForm` 中，
於 `document.getElementById('oppTeamName').textContent = names[oppTeamId];`（第 246 行）之後插入：

```js
  // 本場我方出賽選手，避免隊長報錯場次；名單為空時整行不顯示
  const myPlayers = iAmTeamA ? match.playersA : match.playersB;
  const lineupEl = document.getElementById('reportLineup');
  const lineupText = formatLineup(myPlayers);
  lineupEl.textContent = lineupText ? `本場我方：${lineupText}` : '';
  lineupEl.hidden = !lineupText;
```

- [ ] **Step 3: 新增樣式**

在 `css/tournament.css` 的 `.report-subtitle` 規則之後新增：

```css
.report-lineup {
  color: var(--f1-fg);
  font-size: 0.9rem;
  font-weight: 600;
  margin: -0.5rem 0 0.9rem;
}
```

（負的上邊距是為了抵銷 `.report-subtitle` 既有的 `margin-bottom: 0.9rem`，
讓兩行貼合成一組；`.report-subtitle` 本身不動，以免影響名單為空時的間距。）

- [ ] **Step 4: 確認既有測試未受影響**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: 瀏覽器驗證**

以隊長 token 開啟 `http://localhost:8000/tournament.html?c=<captain_token>`：

1. 我隊場次仍有左緣紅條
2. 點開一場可輸分的場次，彈窗顯示「本場我方：宏彬・彥呈」，且為我隊的兩人而非對手
3. 送出比分流程與改版前一致
4. 若該場名單為空，該行完全不出現（不是顯示空白行）

- [ ] **Step 6: Commit**

```bash
git add tournament.html js/tournament.js css/tournament.css
git commit -m "feat(lineup): 輸分彈窗顯示本場我方選手"
```

---

### Task 6: PWA 快取 bump 與文件更新

**Files:**
- Modify: `sw.js`
- Modify: `CLAUDE.md`
- Modify: `docs/tournament/賽前作業.md`

**Interfaces:**
- Consumes: Task 1-5 的全部改動
- Produces: 無

- [ ] **Step 1: bump `CACHE_NAME`**

`sw.js:6` 目前為 `const CACHE_NAME = 'hanlin-badminton-v11';`，改為：

```js
const CACHE_NAME = 'hanlin-badminton-v12';
```

Run: `grep -n "CACHE_NAME = " sw.js`
Expected: `6:const CACHE_NAME = 'hanlin-badminton-v12';`

- [ ] **Step 2: 更新 CLAUDE.md**

在「## 核心功能與實作」的第 8 節之後新增第 9 節：

```markdown
### 9. 賽程出賽選手（js/tournament.js `makeSide` / `renderSchedule`）
- 賽程每列為上下兩排：上排賽點與比分狀態，下排兩隊左右對稱、選手在自己隊名正下方
- 選手名用**暱稱**（試算表「總賽程表(含出賽選手)」），隊伍名冊 `players` 存本名但不上畫面
- 資料在 `tournament_matches.players_a` / `players_b`（jsonb），由
  `docs/tournament/lineup-2026-08-20.sql` 灌入，**該檔可安全重跑**——試算表改了重跑即同步
- 名單為空（`[]`）時該側只顯示隊名，版面退回加這功能之前的樣子。
  不要拿掉這條退路：SQL 沒跑或跑失敗時，當天頁面才不會空白
- 純函式 `formatLineup`（`js/tournament-form.js`）有 jest 測試，渲染層靠瀏覽器驗證
```

同時更新「## 測試方法」第 1 點的測項數與套件數，以 `npm test` 實際輸出為準。

- [ ] **Step 3: 更新賽前作業.md**

將步驟 4「待辦（抽籤後）：掛名單」改為已完成，並註明改用新檔：

```markdown
4. **已完成（2026-08-10）：掛名單與出賽選手**。改用 `docs/tournament/lineup-2026-08-20.sql`
   （不走本檔下方那五段 update——本檔整體標記為請勿重跑，挑段落執行有誤觸 DO 區塊的風險）。
   該檔含隊名、整隊名冊與 30 場出賽選手，**可安全重跑**；試算表若有異動，改完重跑即可同步。
   前置需先跑一次 `docs/tournament/lineup-schema-2026-08-20.sql`。
```

- [ ] **Step 4: 確認全部測試通過**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add sw.js CLAUDE.md docs/tournament/賽前作業.md
git commit -m "chore(lineup): bump PWA 快取版號並更新專案文件"
```

---

## 上線清單（實作完成後，由人執行）

依序執行，每步驗證後再進行下一步。前三步對現況零影響。

- [ ] 1. Supabase SQL editor 執行 `docs/tournament/lineup-schema-2026-08-20.sql`
      → 核對查詢應回 30 列，`players_a` / `players_b` 皆為 `[]`
- [ ] 2. 執行 `docs/tournament/lineup-2026-08-20.sql`
      → 核對查詢 3a 隊名與人數正確、3b 逐列與試算表相符、3c 回 0 列
- [ ] 3. 重新整理現有計分頁，確認**畫面仍正常**（此時前端未更新，多的 key 不影響）
- [ ] 4. 合併 `match-lineup` 分支並部署到 GitHub Pages
- [ ] 5. 手機開啟計分頁，重整兩次確認拿到新版 Service Worker，版面正確

## 不在本計劃範圍（`賽前作業.md` 另有待辦）

以下兩項與本次改動無關，仍未處理，須另行安排：

- 重發 A 隊（羽林萌主）的 `captain_token`——明文外洩於公開 repo 的 git 歷史
- 賽前確認 v2 Supabase 專案未因閒置而暫停（免費方案閒置約一週自動暫停）
