-- 2026-11-25 貿聯×翰林友誼賽：比賽層級計分規則、點次欄位、公司應援
-- 在 v2 Supabase SQL editor 執行。可安全重跑（add column if not exists / create … if not exists / create or replace）。
-- 設計：docs/superpowers/specs/2026-11-16-friendly-match-design.md
--
-- 舊前端與舊比賽不受影響：score_rule 預設 to15_cap21、point_no 預設 null、payload 只多 key。
-- 執行順序：本檔 → friendly-rpc-selftest.sql（驗證，不留資料）→ 前端部署
-- 回復：重跑 score-rules-2026-08-18.sql 與 lineup-schema-2026-08-20.sql 換回舊函式；新欄位與新表留著無害。

-- 1) 比賽層級計分規則
alter table tournaments
  add column if not exists score_rule text not null default 'to15_cap21'
    check (score_rule in ('to15_cap21', 'to21_cap30'));

-- 2) 場次的點次與 A/B 組別（第三屆舊資料為 null / ''）
alter table tournament_matches
  add column if not exists point_no smallint check (point_no between 1 and 9),
  add column if not exists event_tag text not null default '' check (event_tag in ('', 'A', 'B'));

-- 3) 公司應援數。anon 不直讀，只經 RPC
create table if not exists tournament_cheers (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id uuid not null references tournament_teams(id) on delete cascade,
  count bigint not null default 0,
  primary key (tournament_id, team_id)
);
alter table tournament_cheers enable row level security;

-- 4) 比分合法性（前端 js/tournament-form.js 的 SCORE_RULES 為同一份規則，改規則兩邊要同步）
--    to15_cap21：15:0–13；16–20 帶淨勝 2；21:19、21:20
--    to21_cap30：21:0–19；22–29 帶淨勝 2；30:28、30:29
--    不認得的規則視為 to15_cap21（與前端 resolveScoreRule 一致）
create or replace function tournament_score_legal(p_rule text, p_a int, p_b int)
returns boolean language sql immutable
set search_path = public, pg_temp as $$
  select case when p_rule = 'to21_cap30' then
      (greatest(p_a, p_b) = 21 and least(p_a, p_b) <= 19)
      or (greatest(p_a, p_b) between 22 and 29 and least(p_a, p_b) = greatest(p_a, p_b) - 2)
      or (greatest(p_a, p_b) = 30 and least(p_a, p_b) in (28, 29))
    else
      (greatest(p_a, p_b) = 15 and least(p_a, p_b) <= 13)
      or (greatest(p_a, p_b) between 16 and 20 and least(p_a, p_b) = greatest(p_a, p_b) - 2)
      or (greatest(p_a, p_b) = 21 and least(p_a, p_b) in (19, 20))
  end;
$$;

-- 5) 公開 payload：多吐 tournament.scoreRule、matches[].pointNo / eventTag，其餘一字未動
create or replace function tournament_public_payload(p_tournament uuid)
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tournament', (
      select jsonb_build_object('name', t.name, 'heldOn', t.held_on, 'status', t.status,
                                'scoreRule', t.score_rule)
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

-- 6) 回報比分：依比賽的 score_rule 檢查（其餘狀態機與 score-rules-2026-08-18.sql 相同）
create or replace function tournament_report_score(
  p_token text, p_match uuid, p_score_self int, p_score_opp int)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_team tournament_teams%rowtype;
  v_match tournament_matches%rowtype;
  v_tstatus text;
  v_rule text;
  v_max int;
  v_status text;
  v_score_a smallint;
  v_score_b smallint;
begin
  select * into v_team from tournament_teams where captain_token = p_token;
  if not found then raise exception '無效的隊長連結'; end if;

  select status, score_rule into v_tstatus, v_rule from tournaments where id = v_team.tournament_id;
  if v_tstatus = 'finished' then raise exception '比賽已結束，無法輸入比分'; end if;

  select * into v_match from tournament_matches where id = p_match for update;
  if not found or v_match.tournament_id <> v_team.tournament_id then
    raise exception '找不到這場比賽';
  end if;
  if v_match.team_a_id <> v_team.id and v_match.team_b_id <> v_team.id then
    raise exception '只能回報自己隊伍的比賽';
  end if;
  if v_match.status = 'confirmed' then
    raise exception '這場比賽成績已確認，如需更正請找主辦';
  end if;

  v_max := case when v_rule = 'to21_cap30' then 30 else 21 end;
  if p_score_self is null or p_score_opp is null
     or p_score_self < 0 or p_score_self > v_max
     or p_score_opp < 0 or p_score_opp > v_max then
    raise exception '比分需為 0–% 的整數', v_max;
  end if;
  if p_score_self = p_score_opp then
    raise exception '羽球比賽不會平手，請確認比分';
  end if;
  if not tournament_score_legal(v_rule, p_score_self, p_score_opp) then
    if v_rule = 'to21_cap30' then
      raise exception '比分不符合賽制（21 分制、deuce 最高 30 分），請確認';
    end if;
    raise exception '比分不符合賽制（15 分制、deuce 最高 21 分），請確認';
  end if;

  if v_match.team_a_id = v_team.id then
    v_match.report_a := jsonb_build_object(
      'scoreA', p_score_self, 'scoreB', p_score_opp, 'reportedAt', now());
  else
    v_match.report_b := jsonb_build_object(
      'scoreA', p_score_opp, 'scoreB', p_score_self, 'reportedAt', now());
  end if;

  if v_match.report_a is not null and v_match.report_b is not null then
    if (v_match.report_a->>'scoreA')::int = (v_match.report_b->>'scoreA')::int
       and (v_match.report_a->>'scoreB')::int = (v_match.report_b->>'scoreB')::int then
      v_status := 'confirmed';
      v_score_a := (v_match.report_a->>'scoreA')::smallint;
      v_score_b := (v_match.report_a->>'scoreB')::smallint;
    else
      v_status := 'conflict';
    end if;
  else
    v_status := 'pending';
  end if;

  update tournament_matches
  set report_a = v_match.report_a, report_b = v_match.report_b,
      status = v_status, score_a = v_score_a, score_b = v_score_b
  where id = p_match;

  return jsonb_build_object('status', v_status);
end;
$$;

-- 7) 公司應援。token 可為觀賽 token 或該比賽任一隊的輸分 token。
--    單次 p_n 只收 1–10（前端每 2 秒窗口最多算 10 下）；比賽 finished 後鎖定。
--    已知且接受：anon key 公開，腳本迴圈可灌數；純炒氣氛、不影響比分（見 spec「能不能狂按」）。
create or replace function tournament_cheer_totals_of(p_tournament uuid)
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(tm.id::text, coalesce(c.count, 0)), '{}'::jsonb)
  from tournament_teams tm
  left join tournament_cheers c on c.tournament_id = tm.tournament_id and c.team_id = tm.id
  where tm.tournament_id = p_tournament;
$$;

create or replace function tournament_cheer(p_token text, p_team uuid, p_n int)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_t uuid;
  v_status text;
begin
  select id into v_t from tournaments where public_token = p_token;
  if v_t is null then
    select tournament_id into v_t from tournament_teams where captain_token = p_token;
  end if;
  if v_t is null then raise exception '無效的連結'; end if;

  select status into v_status from tournaments where id = v_t;
  if v_status = 'finished' then raise exception '比賽已結束'; end if;
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

create or replace function tournament_cheer_totals(p_token text)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp as $$
declare
  v_t uuid;
begin
  select id into v_t from tournaments where public_token = p_token;
  if v_t is null then
    select tournament_id into v_t from tournament_teams where captain_token = p_token;
  end if;
  if v_t is null then return null; end if;
  return tournament_cheer_totals_of(v_t);
end;
$$;

-- 8) 核對（純查詢）：第三屆 30 場已確認比分在新規則函式下應全部合法 → 應回 30 / 0
select count(*) filter (where m.status = 'confirmed') as confirmed,
       count(*) filter (where m.status = 'confirmed'
                        and not tournament_score_legal(t.score_rule, m.score_a, m.score_b)) as illegal
from tournament_matches m join tournaments t on t.id = m.tournament_id
where t.name = '第三屆翰林匹克羽球運動會' and t.held_on = '2026-08-20';
