-- 2026-11-25 友誼賽：觀賽頁嵌入 YouTube 直播（直播網址存在賽事資料）
-- 在 v2 Supabase SQL editor 執行。可安全重跑（add column if not exists / create or replace）。
-- 設計：docs/superpowers/specs/2026-11-18-live-stream-design.md
--
-- 舊前端不受影響：payload 只多一個 key（tournament.liveUrl），沒填網址時是 null。
-- 新前端遇到沒有這個 key 的舊 payload 也只是不顯示直播框，所以前後端先上哪一邊都可以。
-- 執行順序：0) 比對 → 1)、2) 修改 → 3) 檢查
-- 回復：重跑 friendly-schema-2026-11-25.sql 裡的 tournament_public_payload 定義（第 5 段）；
--       live_url 欄位留著無害。

-- 0) 執行前比對（唯讀）：正式站目前的定義要跟 friendly-schema-2026-11-25.sql 第 5 段一致才往下做
-- select pg_get_functiondef('public.tournament_public_payload(uuid)'::regprocedure);

-- 1) 直播網址欄位（YouTube 網址或 11 碼影片 ID；前端只認 YouTube，其他一律當成沒填）
alter table tournaments add column if not exists live_url text;

-- 2) 公開 payload：tournament 多吐 liveUrl，其餘與 friendly-schema-2026-11-25.sql 第 5 段一字未動
create or replace function tournament_public_payload(p_tournament uuid)
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tournament', (
      select jsonb_build_object('name', t.name, 'heldOn', t.held_on, 'status', t.status,
                                'scoreRule', t.score_rule, 'liveUrl', t.live_url)
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
        'event', m.event, 'eventTag', m.event_tag, 'pointNo', m.point_no,
        'teamAId', m.team_a_id, 'teamBId', m.team_b_id,
        'playersA', m.players_a, 'playersB', m.players_b,
        'status', m.status, 'scoreA', m.score_a, 'scoreB', m.score_b)
        order by m.round_no, m.court_no)
      from tournament_matches m where m.tournament_id = p_tournament
    ), '[]'::jsonb)
  );
$$;

-- 3) 執行後檢查（唯讀）：每場賽事的 payload 都有 liveUrl 這個 key，其餘欄位照舊
select t.name,
       tournament_public_payload(t.id)->'tournament' ? 'liveUrl' as has_live_url_key,
       tournament_public_payload(t.id)->'tournament'->>'liveUrl' as live_url,
       jsonb_array_length(tournament_public_payload(t.id)->'matches') as match_count
from tournaments t
order by t.held_on;
