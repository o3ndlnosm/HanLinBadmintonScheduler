-- 比分合法性檢查（2026-08-18）：在 v2 Supabase SQL editor 執行一次，可安全重跑。
-- 賽制：15 分制、一定打完。14 平後 deuce 需淨勝 2 分，20 平後先得 21 分者勝（上限 21）。
-- 合法完賽比分：15:0–13；16:14、17:15、18:16、19:17、20:18；21:19、21:20。
-- 與前端 js/tournament-form.js 的 isLegalFinalScore 同步，兩邊規則必須一致。
-- （原版收錄於 v2-schema-bootstrap.sql，僅放寬到 0–21 整數；本檔整份覆蓋該函式。）

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
  v_w int;
  v_l int;
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
     or p_score_self < 0 or p_score_self > 21
     or p_score_opp < 0 or p_score_opp > 21 then
    raise exception '比分需為 0–21 的整數';
  end if;
  if p_score_self = p_score_opp then
    raise exception '羽球比賽不會平手，請確認比分';
  end if;

  v_w := greatest(p_score_self, p_score_opp);
  v_l := least(p_score_self, p_score_opp);
  if not ( (v_w = 15 and v_l <= 13)
        or (v_w between 16 and 20 and v_l = v_w - 2)
        or (v_w = 21 and v_l in (19, 20)) ) then
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
