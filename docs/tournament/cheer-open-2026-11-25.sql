-- 2026-11-25 友誼賽：應援開放時間（開打前鎖住加油、時間到自動開放）＋賽前應援歸零
-- 在 v2 Supabase SQL editor 執行。**已於 2026-11-23 執行過一次**（含 3b 設 18:15、4 歸零）。
-- 1)～3) 可安全重跑；3b)、4) 已改成註解——SQL editor 會整份一起跑，留著的話重跑會把比賽當天的應援數刪光、把改過的開放時間蓋回 18:15。
--
-- 設計（2026-11-23 拍板）：tournaments.cheer_opens_at 是應援開放時間，null＝不限制（第三屆與其他比賽行為不變）。
--   - 後端：tournament_cheer 在開放時間之前一律拒絕（跟 finished 一樣 raise），所以前端還沒換版也灌不進去。
--   - 前端（v25）：payload 的 tournament.cheerOpensAt 還沒到 → 觀賽頁應援條唯讀（沒有按鈕）；
--     時間一到，下一次刷新（約 10 秒內）自動出現按鈕，不用重新整理。
--   - 舊前端（v24）不認得 cheerOpensAt：按鈕還在，但送出會被後端拒絕、數字回到伺服器值。
-- 執行順序：0) 比對 → 1)～3) 修改 → 4) 歸零 → 5) 檢查
-- 回復（約 1 分鐘）：
--   - 只想現在就開放：update tournaments set cheer_opens_at = null where …（10 秒內生效）。
--   - 要把函式退回原版：執行最下方「6) 回復」整段（去掉每行開頭的 `-- `）。cheer_opens_at 欄位留著無害。
--   - 歸零無法回復；執行前的數字見 4) 的 select。

-- 0) 執行前比對（唯讀）：正式站目前的定義要跟 friendly-schema-2026-11-25.sql 第 7 段、live-url-2026-11-25.sql 第 2 段一致才往下做
-- select pg_get_functiondef('public.tournament_cheer(text,uuid,int)'::regprocedure);
-- select pg_get_functiondef('public.tournament_public_payload(uuid)'::regprocedure);

-- 1) 應援開放時間欄位
alter table tournaments add column if not exists cheer_opens_at timestamptz;

-- 2) 應援 RPC：多一道「還沒開放」檢查，其餘與 friendly-schema-2026-11-25.sql 第 7 段一字未動
create or replace function tournament_cheer(p_token text, p_team uuid, p_n int)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_t uuid;
  v_status text;
  v_opens timestamptz;
begin
  select id into v_t from tournaments where public_token = p_token;
  if v_t is null then
    select tournament_id into v_t from tournament_teams where captain_token = p_token;
  end if;
  if v_t is null then raise exception '無效的連結'; end if;

  select status, cheer_opens_at into v_status, v_opens from tournaments where id = v_t;
  if v_status = 'finished' then raise exception '比賽已結束'; end if;
  if v_opens is not null and now() < v_opens then raise exception '應援尚未開放'; end if;
  if p_n is null or p_n < 1 or p_n > 10 then raise exception '應援次數需為 1–10'; end if;
  if not exists (select 1 from tournament_teams where id = p_team and tournament_id = v_t) then
    raise exception '找不到這支隊伍';
  end if;

  insert into tournament_cheers (tournament_id, team_id, count) values (v_t, p_team, p_n)
  on conflict (tournament_id, team_id)
  do update set count = tournament_cheers.count + excluded.count;

  return tournament_cheer_totals_of(v_t);
end;
$$;

-- 3) 公開 payload：tournament 多吐 cheerOpensAt，其餘與 live-url-2026-11-25.sql 第 2 段一字未動
create or replace function tournament_public_payload(p_tournament uuid)
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tournament', (
      select jsonb_build_object('name', t.name, 'heldOn', t.held_on, 'status', t.status,
                                'scoreRule', t.score_rule, 'liveUrl', t.live_url,
                                'cheerOpensAt', t.cheer_opens_at)
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

-- 3b) 友誼賽 18:15（台北）開打才開放應援。確認回傳剛好 1 列。
-- update tournaments set cheer_opens_at = '2026-11-25 18:15:00+08'
-- where name = '貿聯×翰林2026羽球聯合友誼賽' and held_on = '2026-11-25'
-- returning name, held_on, cheer_opens_at;

-- 4) 賽前應援歸零（測試時按的數字）。先看目前數字，再刪；刪了不能回復。
-- select tm.name, c.count
-- from tournament_cheers c
-- join tournament_teams tm on tm.id = c.team_id
-- join tournaments t on t.id = c.tournament_id
-- where t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25';

-- delete from tournament_cheers c
-- using tournaments t
-- where t.id = c.tournament_id
--   and t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
-- returning c.team_id, c.count;

-- 5) 執行後檢查（唯讀）：友誼賽 cheer_opens_at 有值、其他比賽為 null；每場 payload 都有 cheerOpensAt 與 liveUrl；友誼賽應援數 0
select t.name, t.held_on, t.cheer_opens_at,
       tournament_public_payload(t.id)->'tournament' ? 'cheerOpensAt' as has_opens_key,
       tournament_public_payload(t.id)->'tournament' ? 'liveUrl' as has_live_key,
       tournament_cheer_totals_of(t.id) as cheer_totals
from tournaments t
order by t.held_on;

-- 6) 回復（要用時去掉每行開頭的 `-- ` 再執行）：兩支函式退回原版（friendly-schema-2026-11-25.sql 第 7 段、live-url-2026-11-25.sql 第 2 段）
-- create or replace function tournament_cheer(p_token text, p_team uuid, p_n int)
-- returns jsonb language plpgsql security definer
-- set search_path = public, pg_temp as $$
-- declare
--   v_t uuid;
--   v_status text;
-- begin
--   select id into v_t from tournaments where public_token = p_token;
--   if v_t is null then
--     select tournament_id into v_t from tournament_teams where captain_token = p_token;
--   end if;
--   if v_t is null then raise exception '無效的連結'; end if;
--   select status into v_status from tournaments where id = v_t;
--   if v_status = 'finished' then raise exception '比賽已結束'; end if;
--   if p_n is null or p_n < 1 or p_n > 10 then raise exception '應援次數需為 1–10'; end if;
--   if not exists (select 1 from tournament_teams where id = p_team and tournament_id = v_t) then
--     raise exception '找不到這支隊伍';
--   end if;
--   insert into tournament_cheers (tournament_id, team_id, count) values (v_t, p_team, p_n)
--   on conflict (tournament_id, team_id)
--   do update set count = tournament_cheers.count + excluded.count;
--   return tournament_cheer_totals_of(v_t);
-- end;
-- $$;
-- create or replace function tournament_public_payload(p_tournament uuid)
-- returns jsonb language sql stable
-- set search_path = public, pg_temp as $$
--   select jsonb_build_object(
--     'tournament', (
--       select jsonb_build_object('name', t.name, 'heldOn', t.held_on, 'status', t.status,
--                                 'scoreRule', t.score_rule, 'liveUrl', t.live_url)
--       from tournaments t where t.id = p_tournament
--     ),
--     'teams', coalesce((
--       select jsonb_agg(jsonb_build_object('id', tm.id, 'name', tm.name, 'players', tm.players)
--                        order by tm.created_at)
--       from tournament_teams tm where tm.tournament_id = p_tournament
--     ), '[]'::jsonb),
--     'matches', coalesce((
--       select jsonb_agg(jsonb_build_object(
--         'id', m.id, 'roundNo', m.round_no, 'timeSlot', m.time_slot, 'courtNo', m.court_no,
--         'event', m.event, 'eventTag', m.event_tag, 'pointNo', m.point_no,
--         'teamAId', m.team_a_id, 'teamBId', m.team_b_id,
--         'playersA', m.players_a, 'playersB', m.players_b,
--         'status', m.status, 'scoreA', m.score_a, 'scoreB', m.score_b)
--         order by m.round_no, m.court_no)
--       from tournament_matches m where m.tournament_id = p_tournament
--     ), '[]'::jsonb)
--   );
-- $$;
