-- 8/20 第三屆羽球賽：隊名、名冊與 30 場出賽選手
-- 在 v2 Supabase SQL editor 執行。前置：先跑 lineup-schema-2026-08-20.sql
--
-- ✅ 本檔可安全重跑：全為 update，無 insert，重跑只是把同樣的值再寫一次。
--    試算表日後有異動，改完重跑本檔即可同步。
--    （與 seed-2026-08-20.sql 不同，該檔的 DO 區塊重跑會建出重複比賽。）
--
-- 資料來源：試算表「總賽程表(含出賽選手)」（暱稱）、「等級校正與分組」（本名名冊）
-- 字母對應以四項校驗確認，見 docs/superpowers/specs/2026-08-10-match-lineup-design.md

-- ============================================================
-- 1) 隊名與整隊名冊
--    name 條件寫成 in (字母, 正式隊名)，所以第二次執行仍匹配得到。
--    players 存本名（沿用 seed 的分隊名冊），前端不顯示，僅作正式紀錄。
-- ============================================================
update tournament_teams tm set
  name = v.team_name,
  players = v.players::jsonb
from (values
  ('A', '羽林萌主',
   '[{"name":"傅敬軒"},{"name":"郭彥呈"},{"name":"廖宏彬"},{"name":"呂孟娜"},{"name":"蔡依玲"}]'),
  ('B', '綠鯉魚與驢',
   '[{"name":"邱奕鈞"},{"name":"陳奕廷"},{"name":"高新翰"},{"name":"陳怡伶"},{"name":"劉凡瑀"},{"name":"洪蘭萍"}]'),
  ('C', '忠男的嘍囉們',
   '[{"name":"賴忠男"},{"name":"林丞輊"},{"name":"李俊寬"},{"name":"楊皓婷"},{"name":"柳雨彤"},{"name":"吳玉婷"}]'),
  ('D', '拍謝阮冠軍',
   '[{"name":"曾偉哲"},{"name":"吳萬萊"},{"name":"陳彥文"},{"name":"劉杰妮"},{"name":"林玉珠"},{"name":"湯庭禎"}]'),
  ('E', '翰林小羽E',
   '[{"name":"廖翊凱"},{"name":"陳威任"},{"name":"黃迺芸"},{"name":"洪于婷"},{"name":"謝郁嫺"}]')
) as v(letter, team_name, players)
where tm.tournament_id = (select id from tournaments
                          where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and tm.name in (v.letter, v.team_name);

-- ============================================================
-- 2) 30 場出賽選手（暱稱）
--    以 (round_no, court_no) 為 key。左欄 = team_a、右欄 = team_b，
--    順序與試算表兩張分頁一致，已逐場比對 seed 的字母組合無誤。
-- ============================================================
update tournament_matches m set
  players_a = v.pa::jsonb,
  players_b = v.pb::jsonb
from (values
  ( 1, 1, '[{"name":"小悠"},{"name":"雨彤"}]',     '[{"name":"庭禎"},{"name":"杰妮"}]'),
  ( 1, 2, '[{"name":"宏彬"},{"name":"彥呈"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  ( 1, 3, '[{"name":"孟娜"},{"name":"敬軒"}]',     '[{"name":"凡瑀"},{"name":"奕鈞"}]'),
  ( 2, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"Dora"},{"name":"蘭萍"}]'),
  ( 2, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"忠男"},{"name":"俊寬"}]'),
  ( 2, 3, '[{"name":"Rex"},{"name":"玉珠"}]',      '[{"name":"威任"},{"name":"小于"}]'),
  ( 3, 1, '[{"name":"小悠"},{"name":"雨彤"}]',     '[{"name":"迺芸"},{"name":"小于"}]'),
  ( 3, 2, '[{"name":"宏彬"},{"name":"敬軒"}]',     '[{"name":"偉哲"},{"name":"Rex"}]'),
  ( 3, 3, '[{"name":"凡瑀"},{"name":"奕鈞"}]',     '[{"name":"Irene"},{"name":"阿輊"}]'),
  ( 4, 1, '[{"name":"Dora"},{"name":"蘭萍"}]',     '[{"name":"庭禎"},{"name":"玉珠"}]'),
  ( 4, 2, '[{"name":"忠男"},{"name":"阿輊"}]',     '[{"name":"偉哲"},{"name":"萬萊"}]'),
  ( 4, 3, '[{"name":"Anita"},{"name":"彥呈"}]',    '[{"name":"Alan"},{"name":"郁嫺"}]'),
  ( 5, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"迺芸"},{"name":"小于"}]'),
  ( 5, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"Alan"},{"name":"威任"}]'),
  ( 5, 3, '[{"name":"雨彤"},{"name":"俊寬"}]',     '[{"name":"萬萊"},{"name":"杰妮"}]'),
  ( 6, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"杰妮"},{"name":"玉珠"}]'),
  ( 6, 2, '[{"name":"宏彬"},{"name":"敬軒"}]',     '[{"name":"忠男"},{"name":"阿輊"}]'),
  ( 6, 3, '[{"name":"蘭萍"},{"name":"奕鈞"}]',     '[{"name":"威任"},{"name":"郁嫺"}]'),
  ( 7, 1, '[{"name":"Dora"},{"name":"凡瑀"}]',     '[{"name":"迺芸"},{"name":"郁嫺"}]'),
  ( 7, 2, '[{"name":"Eating"},{"name":"新翰"}]',   '[{"name":"萬萊"},{"name":"Rex"}]'),
  ( 7, 3, '[{"name":"孟娜"},{"name":"彥呈"}]',     '[{"name":"Irene"},{"name":"俊寬"}]'),
  ( 8, 1, '[{"name":"孟娜"},{"name":"Anita"}]',    '[{"name":"Irene"},{"name":"雨彤"}]'),
  ( 8, 2, '[{"name":"阿輊"},{"name":"俊寬"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  ( 8, 3, '[{"name":"蘭萍"},{"name":"奕鈞"}]',     '[{"name":"偉哲"},{"name":"庭禎"}]'),
  ( 9, 1, '[{"name":"庭禎"},{"name":"玉珠"}]',     '[{"name":"迺芸"},{"name":"郁嫺"}]'),
  ( 9, 2, '[{"name":"宏彬"},{"name":"彥呈"}]',     '[{"name":"Eating"},{"name":"新翰"}]'),
  ( 9, 3, '[{"name":"忠男"},{"name":"小悠"}]',     '[{"name":"Alan"},{"name":"小于"}]'),
  (10, 1, '[{"name":"Dora"},{"name":"凡瑀"}]',     '[{"name":"小悠"},{"name":"Irene"}]'),
  (10, 2, '[{"name":"偉哲"},{"name":"萬萊"}]',     '[{"name":"Alan"},{"name":"威任"}]'),
  (10, 3, '[{"name":"Anita"},{"name":"敬軒"}]',    '[{"name":"Rex"},{"name":"杰妮"}]')
) as v(round_no, court_no, pa, pb)
where m.tournament_id = (select id from tournaments
                         where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and m.round_no = v.round_no and m.court_no = v.court_no;

-- ============================================================
-- 3) 核對查詢（純 select，可安全重跑）
-- ============================================================

-- 3a) 五隊隊名與人數：應為 羽林萌主 5、綠鯉魚與驢 6、忠男的嘍囉們 6、拍謝阮冠軍 6、翰林小羽E 5
select tm.name, jsonb_array_length(tm.players) as 人數
from tournament_teams tm
where tm.tournament_id = (select id from tournaments
                          where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
order by tm.created_at;

-- 3b) 30 場對戰與出賽選手：逐列與試算表比對
select m.round_no, m.court_no, m.event,
       ta.name as team_a,
       (select string_agg(x->>'name', '・') from jsonb_array_elements(m.players_a) x) as 選手_a,
       tb.name as team_b,
       (select string_agg(x->>'name', '・') from jsonb_array_elements(m.players_b) x) as 選手_b
from tournament_matches m
join tournament_teams ta on ta.id = m.team_a_id
join tournament_teams tb on tb.id = m.team_b_id
where m.tournament_id = (select id from tournaments
                         where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
order by m.round_no, m.court_no;

-- 3c) 沒灌到的場次：應回 0 列
select round_no, court_no
from tournament_matches
where tournament_id = (select id from tournaments
                       where name = '第三屆翰林匹克羽球運動會' and held_on = '2026-08-20')
  and (jsonb_array_length(players_a) <> 2 or jsonb_array_length(players_b) <> 2)
order by round_no, court_no;
