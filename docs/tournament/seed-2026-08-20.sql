-- 8/20 第三屆羽球賽 一次性 seed（在 v2 Supabase SQL editor 執行，service role 不受 RLS 限制）
--
-- ⚠️ 本檔的 DO 區塊已於 2026-08-03 執行完成，請勿重跑，重跑會建出重複比賽！
-- 原因：下面的 DO 區塊沒有存在性檢查，重跑會再建一個同名比賽，
-- 屆時 token 查詢會回 10 列（兩份比賽 × 5 隊），QR code 有一半機率對到沒人用的那份。
-- 若真的需要重新 seed（例如要整批重來），請改用 `setup-2026-08-20.sql`
-- 或 `v2-schema-bootstrap.sql` 內建的存在性檢查版本，或先手動刪掉舊比賽再執行。
--
-- 執行前（僅供對照，不需再跑）：先跑下面兩個查詢，把查到的值取代 DO 區塊開頭的兩個 '<...>'：
--   select id, name from clubs;
--   select id, email from auth.users;

-- do $$
-- declare
--   v_club uuid := '<你的 club_id>';
--   v_user uuid := '<你的 auth.users id>';
--   v_t uuid;
--   v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid;
-- begin
--   insert into tournaments (club_id, name, held_on, status, created_by)
--   values (v_club, '第三屆翰林匹克羽球運動會', '2026-08-20', 'active', v_user)
--   returning id into v_t;
--
--   -- 先以字母建隊（隊伍 1–5 對應 A–E 由抽籤決定；抽完再跑下方「抽籤後」更新）
--   insert into tournament_teams (tournament_id, name) values (v_t, 'A') returning id into v_a;
--   insert into tournament_teams (tournament_id, name) values (v_t, 'B') returning id into v_b;
--   insert into tournament_teams (tournament_id, name) values (v_t, 'C') returning id into v_c;
--   insert into tournament_teams (tournament_id, name) values (v_t, 'D') returning id into v_d;
--   insert into tournament_teams (tournament_id, name) values (v_t, 'E') returning id into v_e;
--
--   -- 30 場賽程（10 輪 × 3 場地；場地1=女雙、場地2=男雙、場地3=混雙）
--   insert into tournament_matches
--     (tournament_id, round_no, time_slot, court_no, event, team_a_id, team_b_id)
--   values
--     (v_t,  1, '18:10-18:20', 1, '女雙', v_c, v_d),
--     (v_t,  1, '18:10-18:20', 2, '男雙', v_a, v_e),
--     (v_t,  1, '18:10-18:20', 3, '混雙', v_a, v_b),
--     (v_t,  2, '18:20-18:30', 1, '女雙', v_a, v_b),
--     (v_t,  2, '18:20-18:30', 2, '男雙', v_b, v_c),
--     (v_t,  2, '18:20-18:30', 3, '混雙', v_d, v_e),
--     (v_t,  3, '18:30-18:40', 1, '女雙', v_c, v_e),
--     (v_t,  3, '18:30-18:40', 2, '男雙', v_a, v_d),
--     (v_t,  3, '18:30-18:40', 3, '混雙', v_b, v_c),
--     (v_t,  4, '18:40-18:50', 1, '女雙', v_b, v_d),
--     (v_t,  4, '18:40-18:50', 2, '男雙', v_c, v_d),
--     (v_t,  4, '18:40-18:50', 3, '混雙', v_a, v_e),
--     (v_t,  5, '18:50-19:00', 1, '女雙', v_a, v_e),
--     (v_t,  5, '18:50-19:00', 2, '男雙', v_b, v_e),
--     (v_t,  5, '18:50-19:00', 3, '混雙', v_c, v_d),
--     (v_t,  6, '19:00-19:10', 1, '女雙', v_a, v_d),
--     (v_t,  6, '19:00-19:10', 2, '男雙', v_a, v_c),
--     (v_t,  6, '19:00-19:10', 3, '混雙', v_b, v_e),
--     (v_t,  7, '19:10-19:20', 1, '女雙', v_b, v_e),
--     (v_t,  7, '19:10-19:20', 2, '男雙', v_b, v_d),
--     (v_t,  7, '19:10-19:20', 3, '混雙', v_a, v_c),
--     (v_t,  8, '19:20-19:30', 1, '女雙', v_a, v_c),
--     (v_t,  8, '19:20-19:30', 2, '男雙', v_c, v_e),
--     (v_t,  8, '19:20-19:30', 3, '混雙', v_b, v_d),
--     (v_t,  9, '19:30-19:40', 1, '女雙', v_d, v_e),
--     (v_t,  9, '19:30-19:40', 2, '男雙', v_a, v_b),
--     (v_t,  9, '19:30-19:40', 3, '混雙', v_c, v_e),
--     (v_t, 10, '19:40-19:50', 1, '女雙', v_b, v_c),
--     (v_t, 10, '19:40-19:50', 2, '男雙', v_d, v_e),
--     (v_t, 10, '19:40-19:50', 3, '混雙', v_a, v_d);
-- end $$;

-- seed 完取 token（public_token 給觀賽連結、captain_token 給各隊 QR code）
-- 可安全重跑（純查詢，不會建資料）；當天核對用
select t.public_token, tm.name as team, tm.captain_token
from tournaments t
join tournament_teams tm on tm.tournament_id = t.id
where t.name = '第三屆翰林匹克羽球運動會'
  and t.held_on = '2026-08-20'
order by tm.name;

-- ============================================================
-- 抽籤後執行：把分隊名單掛到抽到的字母隊。
-- 每段把 <字母> 換成該分隊抽到的 A–E（隊名可順便改成隊長名，如 'A｜敬軒隊'）。
-- ============================================================

-- 分隊 1（邱奕鈞、陳奕廷、高新翰、陳怡伶、劉凡瑀、洪蘭萍）
-- update tournament_teams set
--   players = '[{"name":"邱奕鈞"},{"name":"陳奕廷"},{"name":"高新翰"},{"name":"陳怡伶"},{"name":"劉凡瑀"},{"name":"洪蘭萍"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆翰林匹克羽球運動會')
--   and name = '<字母>';

-- 分隊 2（曾偉哲、吳萬萊、陳彥文、劉杰妮、林玉珠、湯庭禎）
-- update tournament_teams set
--   players = '[{"name":"曾偉哲"},{"name":"吳萬萊"},{"name":"陳彥文"},{"name":"劉杰妮"},{"name":"林玉珠"},{"name":"湯庭禎"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆翰林匹克羽球運動會')
--   and name = '<字母>';

-- 分隊 3（賴忠男、林丞輊、李俊寬、楊皓婷、柳雨彤、吳玉婷）
-- update tournament_teams set
--   players = '[{"name":"賴忠男"},{"name":"林丞輊"},{"name":"李俊寬"},{"name":"楊皓婷"},{"name":"柳雨彤"},{"name":"吳玉婷"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆翰林匹克羽球運動會')
--   and name = '<字母>';

-- 分隊 4（傅敬軒、郭彥呈、廖宏彬、呂孟娜、蔡依玲）
-- update tournament_teams set
--   players = '[{"name":"傅敬軒"},{"name":"郭彥呈"},{"name":"廖宏彬"},{"name":"呂孟娜"},{"name":"蔡依玲"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆翰林匹克羽球運動會')
--   and name = '<字母>';

-- 分隊 5（廖翊凱、陳威任、黃迺芸、洪于婷、謝郁嫺）
-- update tournament_teams set
--   players = '[{"name":"廖翊凱"},{"name":"陳威任"},{"name":"黃迺芸"},{"name":"洪于婷"},{"name":"謝郁嫺"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆翰林匹克羽球運動會')
--   and name = '<字母>';

-- 賽後收尾（鎖定所有輸入）：
-- update tournaments set status = 'finished' where name = '第三屆翰林匹克羽球運動會';
