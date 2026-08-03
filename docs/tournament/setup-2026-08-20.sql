-- v2 badminton-scheduler 完整 schema（9 個 migration 依序合併）
-- 產生於 2026-08-03，供 Supabase SQL Editor 一次執行
-- 來源：github.com/o3ndlnosm/badminton-scheduler supabase/migrations/

-- ===== 20260713060001_p1_schema.sql =====
-- P1 schema: clubs / club_admins / members

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists club_admins (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  skill_level numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_admins_user on club_admins (user_id);
create index if not exists idx_members_club on members (club_id);

-- ===== 20260713060002_p1_rls.sql =====
-- P1 RLS: 以 club_admins 判定 user 管理哪些球隊

alter table clubs enable row level security;
alter table club_admins enable row level security;
alter table members enable row level security;

-- helper：user 是否管理某 club
create or replace function is_club_admin(target_club uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from club_admins
    where club_id = target_club and user_id = auth.uid()
  );
$$;

-- 建立 club 時，自動把建立者加為 owner
create or replace function add_creator_as_owner()
returns trigger language plpgsql security definer as $$
begin
  insert into club_admins (club_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

drop trigger if exists trg_add_creator_as_owner on clubs;
create trigger trg_add_creator_as_owner
  after insert on clubs
  for each row execute function add_creator_as_owner();

-- clubs
create policy clubs_select on clubs for select
  using (is_club_admin(id));
create policy clubs_insert on clubs for insert
  with check (created_by = auth.uid());
create policy clubs_update on clubs for update
  using (is_club_admin(id));
create policy clubs_delete on clubs for delete
  using (is_club_admin(id));

-- club_admins
create policy club_admins_select on club_admins for select
  using (is_club_admin(club_id));
create policy club_admins_write on club_admins for all
  using (
    exists (select 1 from club_admins ca
            where ca.club_id = club_admins.club_id
              and ca.user_id = auth.uid()
              and ca.role = 'owner')
  )
  with check (
    exists (select 1 from club_admins ca
            where ca.club_id = club_admins.club_id
              and ca.user_id = auth.uid()
              and ca.role = 'owner')
  );

-- members
create policy members_all on members for all
  using (is_club_admin(club_id))
  with check (is_club_admin(club_id));

-- ===== 20260713060003_fix_club_admins_rls.sql =====
-- Fix: infinite recursion in club_admins policies (Postgres 42P17)
-- 原因：club_admins 的政策透過 is_club_admin()（其內部又 select club_admins）
-- 造成評估 club_admins 自身政策時無限遞迴。
-- 修法：club_admins 的 select 改為非遞迴的直接判定；寫入僅由
-- add_creator_as_owner 觸發（security definer）進行，P1 不開放使用者端直接寫入。

drop policy if exists club_admins_select on club_admins;
drop policy if exists club_admins_write on club_admins;

-- 使用者只看得到「自己的」club_admins 列（＝自己管理哪些球隊）— 非遞迴
create policy club_admins_select on club_admins for select
  using (user_id = auth.uid());

-- 註：clubs / members 的政策呼叫 is_club_admin() 會讀 club_admins，
-- 此時觸發上面這條非遞迴 select policy，鏈條終止，不再遞迴。
-- P2 若加入「管理協同管理者」UI，再以非遞迴方式補 owner 寫入政策。

-- ===== 20260713070000_finalize_p1_rls.sql =====
-- Finalize P1 RLS: fix clubs SELECT visibility for INSERT...RETURNING, restore clubs_insert,
-- and drop temporary debug helpers.
-- Root cause: INSERT...RETURNING applies the SELECT policy to the returned row; clubs_select
-- (is_club_admin(id)) was false at insert time (owner row is added by an AFTER trigger),
-- so creating a club failed with 42501. Fix: also allow the creator to see their own clubs.

drop policy if exists clubs_select on clubs;
create policy clubs_select on clubs for select
  using (is_club_admin(id) or created_by = auth.uid());

drop policy if exists clubs_insert on clubs;
create policy clubs_insert on clubs for insert
  with check (created_by = auth.uid());

drop function if exists public.whoami();
drop function if exists public.whoami2(uuid);
drop function if exists public.dbg_policies();
drop function if exists public.try_insert_club(uuid);

-- ===== 20260713080001_p2_sessions.sql =====
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  played_on date not null default current_date,
  status text not null default 'active' check (status in ('active','finished')),
  court_count smallint not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists session_attendance (
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (session_id, member_id)
);
create table if not exists session_state (
  session_id uuid primary key references sessions(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_sessions_club on sessions(club_id);

alter table sessions enable row level security;
alter table session_attendance enable row level security;
alter table session_state enable row level security;

-- sessions: gated by club membership. NOTE: the creator is already a club admin at
-- create time, so is_club_admin(club_id) is true immediately (no AFTER-trigger dependency),
-- which avoids the INSERT...RETURNING SELECT-policy pitfall that P1's clubs table hit.
create policy sessions_all on sessions for all
  using (is_club_admin(club_id)) with check (is_club_admin(club_id));

create or replace function is_session_admin(target_session uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from sessions s
    where s.id = target_session and is_club_admin(s.club_id)
  );
$$;

create policy session_attendance_all on session_attendance for all
  using (is_session_admin(session_id)) with check (is_session_admin(session_id));
create policy session_state_all on session_state for all
  using (is_session_admin(session_id)) with check (is_session_admin(session_id));

-- ===== 20260714090001_p3_abuse_limits.sql =====
-- P3: 開放註冊的濫用硬上限（BEFORE INSERT trigger，超限回明確錯誤）
-- 值寫死：5 clubs/user、200 members/club、500 sessions/club。
-- security definer：計數不受 RLS 影響（clubs_select 只看得到自己的，計自己的量剛好夠；
-- 但 members/sessions 由 club_id 計數，統一用 definer 保險）。

create or replace function enforce_clubs_per_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from clubs where created_by = new.created_by) >= 5 then
    raise exception '每個帳號最多建立 5 個球隊';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_clubs on clubs;
create trigger trg_limit_clubs
  before insert on clubs
  for each row execute function enforce_clubs_per_user();

create or replace function enforce_members_per_club()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from members where club_id = new.club_id) >= 200 then
    raise exception '每個球隊最多 200 名球員';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_members on members;
create trigger trg_limit_members
  before insert on members
  for each row execute function enforce_members_per_club();

create or replace function enforce_sessions_per_club()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from sessions where club_id = new.club_id) >= 500 then
    raise exception '每個球隊最多 500 場次';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_sessions on sessions;
create trigger trg_limit_sessions
  before insert on sessions
  for each row execute function enforce_sessions_per_club();

-- ===== 20260714090002_harden_definer_search_path.sql =====
-- P3 RLS 稽核發現：P1/P2 的三個 security definer 函式未鎖定 search_path，
-- 存在 schema 混淆攻擊面（與 20260714090001 對濫用上限函式的處理同一標準）。
-- 用 alter function 補鎖，不重建函式本體，避免定義漂移。

alter function is_club_admin(uuid) set search_path = public, pg_temp;
alter function is_session_admin(uuid) set search_path = public, pg_temp;
alter function add_creator_as_owner() set search_path = public, pg_temp;

-- ===== 20260722100001_p4_tournaments.sql =====
-- P4: 比賽模式（tournaments / tournament_teams / tournament_matches）
-- 管理者沿用 club_admins RLS；隊長/觀眾不直讀資料表（token RPC 見下一個 migration）。
-- token 用 pgcrypto gen_random_bytes(16) hex（32 字元），Supabase 預設可用。

create extension if not exists pgcrypto;

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  held_on date not null default current_date,
  status text not null default 'draft' check (status in ('draft','active','finished')),
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  players jsonb not null default '[]'::jsonb,
  captain_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_no smallint not null,
  time_slot text not null default '',
  court_no smallint not null,
  event text not null check (event in ('男雙','女雙','混雙')),
  team_a_id uuid not null references tournament_teams(id) on delete cascade,
  team_b_id uuid not null references tournament_teams(id) on delete cascade,
  report_a jsonb,
  report_b jsonb,
  status text not null default 'pending' check (status in ('pending','conflict','confirmed')),
  score_a smallint,
  score_b smallint,
  check (team_a_id <> team_b_id)
);

create index if not exists idx_tournaments_club on tournaments(club_id);
create index if not exists idx_tournament_teams_t on tournament_teams(tournament_id);
create index if not exists idx_tournament_matches_t on tournament_matches(tournament_id);

alter table tournaments enable row level security;
alter table tournament_teams enable row level security;
alter table tournament_matches enable row level security;

-- 管理者：比照 sessions 的 is_session_admin 模式
create policy tournaments_all on tournaments for all
  using (is_club_admin(club_id)) with check (is_club_admin(club_id));

create or replace function is_tournament_admin(target_tournament uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from tournaments t
    where t.id = target_tournament and is_club_admin(t.club_id)
  );
$$;

create policy tournament_teams_all on tournament_teams for all
  using (is_tournament_admin(tournament_id)) with check (is_tournament_admin(tournament_id));
create policy tournament_matches_all on tournament_matches for all
  using (is_tournament_admin(tournament_id)) with check (is_tournament_admin(tournament_id));

-- 濫用上限（比照 20260714090001 的 BEFORE INSERT trigger 模式）
create or replace function enforce_tournaments_per_club()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from tournaments where club_id = new.club_id) >= 20 then
    raise exception '每個球隊最多 20 場比賽';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limit_tournaments on tournaments;
create trigger trg_limit_tournaments
  before insert on tournaments
  for each row execute function enforce_tournaments_per_club();

create or replace function enforce_teams_per_tournament()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from tournament_teams where tournament_id = new.tournament_id) >= 10 then
    raise exception '每場比賽最多 10 支隊伍';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limit_teams on tournament_teams;
create trigger trg_limit_teams
  before insert on tournament_teams
  for each row execute function enforce_teams_per_tournament();

create or replace function enforce_matches_per_tournament()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select count(*) from tournament_matches where tournament_id = new.tournament_id) >= 200 then
    raise exception '每場比賽最多 200 場對戰';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limit_matches on tournament_matches;
create trigger trg_limit_matches
  before insert on tournament_matches
  for each row execute function enforce_matches_per_tournament();

-- ===== 20260722100002_p4_tournament_rpc.sql =====
-- P4: 比賽模式 token RPC。隊長/觀眾（anon）不直讀資料表，一律經 security definer 函式，
-- 以 token 為唯一憑證。jsonb key 直接輸出 camelCase，前端不再轉換。

-- 共用 payload（非 definer；由 definer 函式內呼叫時以 definer 權限執行，
-- anon 直呼時因 RLS 拿不到任何列，回傳空殼，無洩漏面）
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
        'status', m.status, 'scoreA', m.score_a, 'scoreB', m.score_b)
        order by m.round_no, m.court_no)
      from tournament_matches m where m.tournament_id = p_tournament
    ), '[]'::jsonb)
  );
$$;

create or replace function tournament_public_view(p_token text)
returns jsonb language sql security definer stable
set search_path = public, pg_temp as $$
  select tournament_public_payload(t.id) from tournaments t where t.public_token = p_token;
$$;

create or replace function tournament_captain_view(p_token text)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp as $$
declare
  v_team tournament_teams%rowtype;
begin
  select * into v_team from tournament_teams where captain_token = p_token;
  if not found then return null; end if;
  return tournament_public_payload(v_team.tournament_id) || jsonb_build_object(
    'myTeamId', v_team.id,
    'reports', coalesce((
      select jsonb_object_agg(m.id::text, jsonb_build_object(
        'myReport', case when m.team_a_id = v_team.id then m.report_a else m.report_b end,
        'oppReported', case when m.team_a_id = v_team.id
                            then m.report_b is not null else m.report_a is not null end))
      from tournament_matches m
      where m.tournament_id = v_team.tournament_id
        and (m.team_a_id = v_team.id or m.team_b_id = v_team.id)
    ), '{}'::jsonb)
  );
end;
$$;

-- 回報比分狀態機（原子：for update 鎖列後判定）
-- 兩隊各自回報，report 一律正規化成 A/B 方向存放；
-- 兩份都在且一致 → confirmed 寫入正式比分；不一致 → conflict；重送覆蓋自己那份後重判。
create or replace function tournament_report_score(
  p_token text, p_match uuid, p_score_self int, p_score_opp int)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_team tournament_teams%rowtype;
  v_match tournament_matches%rowtype;
  v_tstatus text;
  v_status text;
  v_score_a smallint;
  v_score_b smallint;
begin
  select * into v_team from tournament_teams where captain_token = p_token;
  if not found then raise exception '無效的隊長連結'; end if;

  select status into v_tstatus from tournaments where id = v_team.tournament_id;
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

  if p_score_self is null or p_score_opp is null
     or p_score_self < 0 or p_score_self > 30
     or p_score_opp < 0 or p_score_opp > 30 then
    raise exception '比分需為 0–30 的整數';
  end if;
  if p_score_self = p_score_opp then
    raise exception '羽球比賽不會平手，請確認比分';
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


-- ============================================================
-- 社團與比賽 bootstrap（自動解析 auth user 與 club，不需手填 UUID）
-- 前置：Supabase Dashboard → Authentication → Users → Add user 建一個帳號
-- ============================================================
do $$
declare
  v_club uuid;
  v_user uuid;
  v_t uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception '找不到任何使用者。請先到 Authentication → Users → Add user 建立帳號後再執行';
  end if;

  select id into v_club from clubs order by created_at limit 1;
  if v_club is null then
    insert into clubs (name, created_by) values ('翰林羽球社', v_user) returning id into v_club;
    insert into club_admins (club_id, user_id, role) values (v_club, v_user, 'owner');
  end if;

  if exists (select 1 from tournaments where name = '第三屆羽球社運動會') then
    raise notice '比賽已存在，略過建立（避免重複 seed）';
    return;
  end if;

  insert into tournaments (club_id, name, held_on, status, created_by)
  values (v_club, '第三屆羽球社運動會', '2026-08-20', 'active', v_user)
  returning id into v_t;

  -- 先以字母建隊（隊伍 1–5 對應 A–E 由抽籤決定；抽完再跑下方「抽籤後」更新）
  insert into tournament_teams (tournament_id, name) values (v_t, 'A') returning id into v_a;
  insert into tournament_teams (tournament_id, name) values (v_t, 'B') returning id into v_b;
  insert into tournament_teams (tournament_id, name) values (v_t, 'C') returning id into v_c;
  insert into tournament_teams (tournament_id, name) values (v_t, 'D') returning id into v_d;
  insert into tournament_teams (tournament_id, name) values (v_t, 'E') returning id into v_e;

  -- 30 場賽程（10 輪 × 3 場地；場地1=女雙、場地2=男雙、場地3=混雙）
  insert into tournament_matches
    (tournament_id, round_no, time_slot, court_no, event, team_a_id, team_b_id)
  values
    (v_t,  1, '18:10-18:20', 1, '女雙', v_c, v_d),
    (v_t,  1, '18:10-18:20', 2, '男雙', v_a, v_e),
    (v_t,  1, '18:10-18:20', 3, '混雙', v_a, v_b),
    (v_t,  2, '18:20-18:30', 1, '女雙', v_a, v_b),
    (v_t,  2, '18:20-18:30', 2, '男雙', v_b, v_c),
    (v_t,  2, '18:20-18:30', 3, '混雙', v_d, v_e),
    (v_t,  3, '18:30-18:40', 1, '女雙', v_c, v_e),
    (v_t,  3, '18:30-18:40', 2, '男雙', v_a, v_d),
    (v_t,  3, '18:30-18:40', 3, '混雙', v_b, v_c),
    (v_t,  4, '18:40-18:50', 1, '女雙', v_b, v_d),
    (v_t,  4, '18:40-18:50', 2, '男雙', v_c, v_d),
    (v_t,  4, '18:40-18:50', 3, '混雙', v_a, v_e),
    (v_t,  5, '18:50-19:00', 1, '女雙', v_a, v_e),
    (v_t,  5, '18:50-19:00', 2, '男雙', v_b, v_e),
    (v_t,  5, '18:50-19:00', 3, '混雙', v_c, v_d),
    (v_t,  6, '19:00-19:10', 1, '女雙', v_a, v_d),
    (v_t,  6, '19:00-19:10', 2, '男雙', v_a, v_c),
    (v_t,  6, '19:00-19:10', 3, '混雙', v_b, v_e),
    (v_t,  7, '19:10-19:20', 1, '女雙', v_b, v_e),
    (v_t,  7, '19:10-19:20', 2, '男雙', v_b, v_d),
    (v_t,  7, '19:10-19:20', 3, '混雙', v_a, v_c),
    (v_t,  8, '19:20-19:30', 1, '女雙', v_a, v_c),
    (v_t,  8, '19:20-19:30', 2, '男雙', v_c, v_e),
    (v_t,  8, '19:20-19:30', 3, '混雙', v_b, v_d),
    (v_t,  9, '19:30-19:40', 1, '女雙', v_d, v_e),
    (v_t,  9, '19:30-19:40', 2, '男雙', v_a, v_b),
    (v_t,  9, '19:30-19:40', 3, '混雙', v_c, v_e),
    (v_t, 10, '19:40-19:50', 1, '女雙', v_b, v_c),
    (v_t, 10, '19:40-19:50', 2, '男雙', v_d, v_e),
    (v_t, 10, '19:40-19:50', 3, '混雙', v_a, v_d);
end $$;

-- 取 token：public_token 給觀賽連結、captain_token 給各隊 QR code
select t.public_token, tm.name as team, tm.captain_token
from tournaments t
join tournament_teams tm on tm.tournament_id = t.id
where t.name = '第三屆羽球社運動會'
order by tm.name;
