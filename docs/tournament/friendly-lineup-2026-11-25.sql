-- 2026-11-25 貿聯×翰林友誼賽：每場出賽選手（人名到了之後填入再執行）。可安全重跑——全為 update、無 insert。
-- 以「場次」（輪 + 場地）為單位：同一點三場是否同一組人尚未確認，以場次為單位兩種情況都適用。
-- 格式比照第三屆：'[{"name":"小悠"},{"name":"雨彤"}]'；顯示用暱稱。留 '[]' 的場次只顯示公司名（畫面已有此退路）。
-- 試算表改了就改這裡再跑一次即可同步。

with lineup(round_no, court_no, players_a, players_b) as (values
  --  輪 場地  貿聯（左）                翰林（右）                -- 點次
  (1, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第一點 男雙A
  (1, 2, '[]'::jsonb, '[]'::jsonb),                               -- 第二點 混雙A
  (1, 3, '[]'::jsonb, '[]'::jsonb),                               -- 第三點 女雙
  (2, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第四點 混雙B
  (2, 2, '[]'::jsonb, '[]'::jsonb),                               -- 第五點 男雙B
  (2, 3, '[]'::jsonb, '[]'::jsonb),                               -- 第一點 男雙A
  (3, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第二點 混雙A
  (3, 2, '[]'::jsonb, '[]'::jsonb),                               -- 第三點 女雙
  (3, 3, '[]'::jsonb, '[]'::jsonb),                               -- 第四點 混雙B
  (4, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第五點 男雙B
  (4, 2, '[]'::jsonb, '[]'::jsonb),                               -- 第一點 男雙A
  (5, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第二點 混雙A
  (5, 2, '[]'::jsonb, '[]'::jsonb),                               -- 第三點 女雙
  (6, 1, '[]'::jsonb, '[]'::jsonb),                               -- 第四點 混雙B
  (6, 2, '[]'::jsonb, '[]'::jsonb)                                -- 第五點 男雙B
)
update tournament_matches m
set players_a = l.players_a, players_b = l.players_b
from lineup l, tournaments t
where t.id = m.tournament_id
  and t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
  and m.round_no = l.round_no and m.court_no = l.court_no;

-- 核對：應回 15 列，名單與試算表一致
select m.round_no, m.court_no, m.point_no, m.event || m.event_tag as event, m.players_a, m.players_b
from tournament_matches m join tournaments t on t.id = m.tournament_id
where t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
order by m.round_no, m.court_no;
