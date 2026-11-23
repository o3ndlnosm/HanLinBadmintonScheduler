-- 2026-11-25 友誼賽：場地改成 2、3、4 號（2026-11-23 孟娜通知；原本 seed 寫 1、2、3）。在 v2 Supabase SQL editor 執行。
-- 對應：1→2、2→3、3→4（第 1～3 輪三場在 2、3、4 號場；第 4～6 輪兩場在 2、3 號場）。
-- **可安全重跑**：已經有 4 號場就整段不動（只會位移一次）。
-- 之後要重跑 friendly-lineup-2026-11-25.sql，裡面的場地已同步改成 2、3、4。
-- 回復：把下面的 + 1 改成 - 1、守衛的 court_no = 4 改成 court_no = 1，再跑一次。

update tournament_matches m
set court_no = m.court_no + 1
from tournaments t
where t.id = m.tournament_id
  and t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
  and not exists (
    select 1 from tournament_matches m2
    where m2.tournament_id = t.id and m2.court_no = 4
  )
returning m.round_no, m.court_no, m.point_no, m.event || m.event_tag as event;

-- 核對（唯讀）：應回 15 列；第 1～3 輪場地 2、3、4，第 4～6 輪場地 2、3
select m.round_no, m.time_slot, m.court_no, m.point_no, m.event || m.event_tag as event
from tournament_matches m join tournaments t on t.id = m.tournament_id
where t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
order by m.round_no, m.court_no;
