-- 2026-11-25 貿聯×翰林友誼賽 建賽。在 v2 Supabase SQL editor 執行。
-- 前置：friendly-schema-2026-11-25.sql 已執行。
-- **可安全重跑**：同名同日比賽已存在就略過（第三屆 seed 沒有這道檢查，重跑會建出重複比賽）。
-- 測試用：把下方 c_name 與檔尾查詢的賽名換成「～友誼賽測試（測完即刪）～」即可建出一模一樣的測試比賽，
--         測完跑 friendly-test-cleanup.sql 刪除。
-- token 只在檔尾查詢的結果看，**不要貼進任何會 commit 的檔案**（repo 公開）。

do $$
declare
  c_name constant text := '貿聯×翰林2026羽球聯合友誼賽';
  c_day constant date := '2026-11-25';
  v_src tournaments%rowtype;
  v_t uuid;
  v_m uuid;
  v_h uuid;
begin
  if exists (select 1 from tournaments where name = c_name and held_on = c_day) then
    raise notice '已存在，略過：%', c_name;
    return;
  end if;

  -- club_id / created_by 沿用第三屆，不手填
  select * into v_src from tournaments where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20';
  if not found then raise exception '找不到第三屆比賽，無法取得 club_id / created_by'; end if;

  insert into tournaments (club_id, name, held_on, status, created_by, score_rule)
  values (v_src.club_id, c_name, c_day, 'active', v_src.created_by, 'to21_cap30')
  returning id into v_t;

  -- 隊伍順序（payload 依 created_at 排序）決定左右與代表色：貿聯在左（紅）、翰林在右（青綠）。
  -- 同一交易內 now() 相同，必須明確錯開，否則順序不保證。
  insert into tournament_teams (tournament_id, name, created_at) values (v_t, '貿聯', now())
  returning id into v_m;
  insert into tournament_teams (tournament_id, name, created_at) values (v_t, '翰林', now() + interval '1 second')
  returning id into v_h;

  -- 15 場（試算表「貿聯友誼賽」分頁）；每點三戰兩勝、五點三勝
  -- 第一點 男雙A、第二點 混雙A、第三點 女雙、第四點 混雙B、第五點 男雙B
  insert into tournament_matches
    (tournament_id, round_no, time_slot, court_no, event, event_tag, point_no, team_a_id, team_b_id)
  values
    (v_t, 1, '18:15-18:30', 1, '男雙', 'A', 1, v_m, v_h),
    (v_t, 1, '18:15-18:30', 2, '混雙', 'A', 2, v_m, v_h),
    (v_t, 1, '18:15-18:30', 3, '女雙', '',  3, v_m, v_h),
    (v_t, 2, '18:30-18:45', 1, '混雙', 'B', 4, v_m, v_h),
    (v_t, 2, '18:30-18:45', 2, '男雙', 'B', 5, v_m, v_h),
    (v_t, 2, '18:30-18:45', 3, '男雙', 'A', 1, v_m, v_h),
    (v_t, 3, '18:45-19:00', 1, '混雙', 'A', 2, v_m, v_h),
    (v_t, 3, '18:45-19:00', 2, '女雙', '',  3, v_m, v_h),
    (v_t, 3, '18:45-19:00', 3, '混雙', 'B', 4, v_m, v_h),
    (v_t, 4, '19:00-19:15', 1, '男雙', 'B', 5, v_m, v_h),
    (v_t, 4, '19:00-19:15', 2, '男雙', 'A', 1, v_m, v_h),
    (v_t, 5, '19:15-19:30', 1, '混雙', 'A', 2, v_m, v_h),
    (v_t, 5, '19:15-19:30', 2, '女雙', '',  3, v_m, v_h),
    (v_t, 6, '19:30-19:45', 1, '混雙', 'B', 4, v_m, v_h),
    (v_t, 6, '19:30-19:45', 2, '男雙', 'B', 5, v_m, v_h);
end;
$$;

-- 核對＋取連結用 token（純查詢，可安全重跑）
-- 預期：2 列（貿聯在前）；每列 matches = 15、pending = 15、rule = to21_cap30
select t.public_token, tm.name as team, tm.captain_token,
       (select count(*) from tournament_matches m where m.tournament_id = t.id) as matches,
       (select count(*) from tournament_matches m where m.tournament_id = t.id and m.status = 'pending') as pending,
       t.score_rule as rule
from tournaments t
join tournament_teams tm on tm.tournament_id = t.id
where t.name = '貿聯×翰林2026羽球聯合友誼賽' and t.held_on = '2026-11-25'
order by tm.created_at;

-- 賽後收尾（鎖定比分輸入與應援）：
-- update tournaments set status = 'finished' where name = '貿聯×翰林2026羽球聯合友誼賽' and held_on = '2026-11-25';
