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
