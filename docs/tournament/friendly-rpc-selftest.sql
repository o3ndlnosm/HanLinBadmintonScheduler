-- friendly-schema-2026-11-25.sql 的自我測試。在 v2 Supabase SQL editor 執行，**不留任何資料**：
-- 全部檢查放在一個 DO 區塊，最後一定以 exception 結束，整個交易回滾。
--   結果訊息「SELFTEST PASS」→ 全部通過
--   結果訊息「SELFTEST FAIL …」或其他錯誤 → 有問題
-- 需要第三屆比賽存在（借用其 club_id / created_by 建臨時測試比賽）。

create or replace function pg_temp.expect_error(p_sql text, p_expected text)
returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from p_expected then
      raise exception 'SELFTEST FAIL: % → 得到「%」，預期「%」', p_sql, v_msg, p_expected;
    end if;
    return;
  end;
  raise exception 'SELFTEST FAIL: % 應該要被擋（%）', p_sql, p_expected;
end;
$$;

do $$
declare
  v_src tournaments%rowtype;
  v_t uuid; v_ptok text;
  v_m uuid; v_mtok text; v_h uuid; v_htok text;
  v_m1 uuid; v_m2 uuid;
  v_t15 uuid; v_a uuid; v_atok text; v_b uuid; v_x uuid;
  r jsonb;
  v_row tournament_matches%rowtype;
  v_n int;
  c_rule21 constant text := '比分不符合賽制（21 分制、deuce 最高 30 分），請確認';
begin
  select * into v_src from tournaments where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20';
  if not found then raise exception 'SELFTEST FAIL: 找不到第三屆比賽'; end if;

  -- 測試比賽（21 分制、兩隊、同一點兩場）
  insert into tournaments (club_id, name, held_on, status, created_by, score_rule)
  values (v_src.club_id, '～selftest～', '2026-11-25', 'active', v_src.created_by, 'to21_cap30')
  returning id, public_token into v_t, v_ptok;
  insert into tournament_teams (tournament_id, name) values (v_t, '貿聯') returning id, captain_token into v_m, v_mtok;
  insert into tournament_teams (tournament_id, name) values (v_t, '翰林') returning id, captain_token into v_h, v_htok;
  insert into tournament_matches (tournament_id, round_no, time_slot, court_no, event, event_tag, point_no, team_a_id, team_b_id)
  values (v_t, 1, '18:15-18:30', 1, '男雙', 'A', 1, v_m, v_h) returning id into v_m1;
  insert into tournament_matches (tournament_id, round_no, time_slot, court_no, event, event_tag, point_no, team_a_id, team_b_id)
  values (v_t, 2, '18:30-18:45', 3, '男雙', 'A', 1, v_m, v_h) returning id into v_m2;

  -- payload 帶新欄位
  r := tournament_public_view(v_ptok);
  assert r->'tournament'->>'scoreRule' = 'to21_cap30', 'SELFTEST FAIL: scoreRule';
  assert (r->'matches'->0->>'pointNo')::int = 1, 'SELFTEST FAIL: pointNo';
  assert r->'matches'->0->>'eventTag' = 'A', 'SELFTEST FAIL: eventTag';
  assert r->'matches'->0 ? 'playersA', 'SELFTEST FAIL: playersA 被拿掉了';

  -- 21 分制：不合法要擋，訊息與前端一致
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 22, 21)', v_mtok, v_m1), c_rule21);
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 21, 20)', v_mtok, v_m1), c_rule21);
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 20, 21)', v_mtok, v_m1), c_rule21);
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 30, 27)', v_mtok, v_m1), c_rule21);
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 31, 29)', v_mtok, v_m1), '比分需為 0–30 的整數');

  -- 21 分制：合法要收；雙方一致 → confirmed（A=貿聯 22、B=翰林 20）
  r := tournament_report_score(v_mtok, v_m1, 22, 20);
  assert r->>'status' = 'pending', 'SELFTEST FAIL: 單方回報應為 pending';
  r := tournament_report_score(v_htok, v_m1, 20, 22);
  assert r->>'status' = 'confirmed', 'SELFTEST FAIL: 雙方一致應為 confirmed';
  select * into v_row from tournament_matches where id = v_m1;
  assert v_row.score_a = 22 and v_row.score_b = 20, 'SELFTEST FAIL: 確認比分寫錯方向';

  -- 30:29 收；雙方不一致 → conflict
  r := tournament_report_score(v_mtok, v_m2, 30, 29);
  assert r->>'status' = 'pending', 'SELFTEST FAIL: 30:29 應收';
  r := tournament_report_score(v_htok, v_m2, 28, 30);
  assert r->>'status' = 'conflict', 'SELFTEST FAIL: 不一致應為 conflict';

  -- 預設規則（15 分制）的比賽行為不變
  insert into tournaments (club_id, name, held_on, status, created_by)
  values (v_src.club_id, '～selftest15～', '2026-11-25', 'active', v_src.created_by) returning id into v_t15;
  insert into tournament_teams (tournament_id, name) values (v_t15, 'A') returning id, captain_token into v_a, v_atok;
  insert into tournament_teams (tournament_id, name) values (v_t15, 'B') returning id into v_b;
  insert into tournament_matches (tournament_id, round_no, court_no, event, team_a_id, team_b_id)
  values (v_t15, 1, 1, '女雙', v_a, v_b) returning id into v_x;
  r := tournament_report_score(v_atok, v_x, 21, 20);
  assert r->>'status' = 'pending', 'SELFTEST FAIL: 15 分制 21:20 應收';
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 22, 20)', v_atok, v_x), '比分需為 0–21 的整數');
  perform pg_temp.expect_error(format('select tournament_report_score(%L, %L::uuid, 15, 14)', v_atok, v_x),
    '比分不符合賽制（15 分制、deuce 最高 21 分），請確認');

  -- 應援：觀賽 token 與輸分 token 都能加；總數正確
  r := tournament_cheer(v_ptok, v_m, 10);
  assert (r->>v_m::text)::int = 10 and (r->>v_h::text)::int = 0, 'SELFTEST FAIL: 應援 +10';
  r := tournament_cheer(v_mtok, v_h, 3);
  r := tournament_cheer(v_ptok, v_m, 1);
  r := tournament_cheer_totals(v_ptok);
  assert (r->>v_m::text)::int = 11 and (r->>v_h::text)::int = 3, 'SELFTEST FAIL: 應援總數';
  assert tournament_cheer_totals('no-such-token') is null, 'SELFTEST FAIL: 錯誤 token 應回 null';
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 0)', v_ptok, v_m), '應援次數需為 1–10');
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 11)', v_ptok, v_m), '應援次數需為 1–10');
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 1)', v_ptok, v_a), '找不到這支隊伍');
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 1)', 'no-such-token', v_m), '無效的連結');
  -- 應援開放時間（cheer-open-2026-11-25.sql）：還沒到要擋、payload 有 cheerOpensAt；過了或 null 照常收
  update tournaments set cheer_opens_at = now() + interval '1 hour' where id = v_t;
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 1)', v_ptok, v_m), '應援尚未開放');
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 1)', v_mtok, v_m), '應援尚未開放');
  r := tournament_public_view(v_ptok);
  assert r->'tournament'->>'cheerOpensAt' is not null, 'SELFTEST FAIL: payload 應帶 cheerOpensAt';
  update tournaments set cheer_opens_at = now() - interval '1 second' where id = v_t;
  r := tournament_cheer(v_ptok, v_m, 1);
  assert (r->>v_m::text)::int = 12, 'SELFTEST FAIL: 開放時間已過應照常收';
  update tournaments set cheer_opens_at = null where id = v_t;
  r := tournament_cheer(v_ptok, v_m, 1);
  assert (r->>v_m::text)::int = 13, 'SELFTEST FAIL: 沒設開放時間應照常收';
  r := tournament_public_view(v_ptok);
  assert r->'tournament' ? 'cheerOpensAt' and r->'tournament'->'cheerOpensAt' = 'null'::jsonb, 'SELFTEST FAIL: 沒設時 cheerOpensAt 應為 null';
  update tournaments set status = 'finished' where id = v_t;
  perform pg_temp.expect_error(format('select tournament_cheer(%L, %L::uuid, 1)', v_ptok, v_m), '比賽已結束');

  -- 第三屆 30 場已確認比分在新規則函式下全部合法
  select count(*) into v_n
  from tournament_matches m join tournaments t on t.id = m.tournament_id
  where t.id = v_src.id and m.status = 'confirmed';
  assert v_n = 30, format('SELFTEST FAIL: 第三屆 confirmed 應為 30，得到 %s', v_n);
  select count(*) into v_n
  from tournament_matches m join tournaments t on t.id = m.tournament_id
  where t.id = v_src.id and m.status = 'confirmed'
    and not tournament_score_legal(t.score_rule, m.score_a, m.score_b);
  assert v_n = 0, format('SELFTEST FAIL: 第三屆有 %s 場比分被新規則判為不合法', v_n);

  raise exception 'SELFTEST PASS（以 exception 結束以回滾所有測試資料）';
end;
$$;
