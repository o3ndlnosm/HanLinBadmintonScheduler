-- 刪除友誼賽的測試比賽（以 friendly-seed-2026-11-25.sql 換名建出的「～友誼賽測試（測完即刪）～」）。
-- tournament_teams / tournament_matches / tournament_cheers 皆 on delete cascade，比分、回報（report_a/report_b）、
-- 應援數會一起刪掉（第三屆教訓：只清 status 會漏掉單方回報）。可安全重跑。
delete from tournaments where name = '～友誼賽測試（測完即刪）～';

-- 複驗：應回 0 / 0
select (select count(*) from tournaments where name = '～友誼賽測試（測完即刪）～') as test_tournaments,
       (select count(*) from tournament_cheers c
         where not exists (select 1 from tournaments t where t.id = c.tournament_id)) as orphan_cheers;
