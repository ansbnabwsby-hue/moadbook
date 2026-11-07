CREATE OR REPLACE FUNCTION public.moadbook_games_finish_session(
  p_user_id text,p_session_id uuid,p_session_token uuid,p_client_score integer,p_duration_ms integer,p_metrics jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE
  s moadbook_games.sessions%ROWTYPE;
  v_actual_ms integer;
  v_score integer := 0;
  v_reason text;
  v_status text := 'completed';
  v_answers integer := 0;
  v_correct integer := 0;
  v_pairs integer;
  v_moves integer;
  v_levels integer;
  v_lines integer;
  v_turns integer;
  v_food integer;
  v_coins integer;
  v_dodged integer;
  v_distance integer;
  v_points integer := 0;
BEGIN
  SELECT * INTO s FROM moadbook_games.sessions
  WHERE session_id=p_session_id AND session_token=p_session_token AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF s.status='completed' THEN
    RETURN jsonb_build_object('accepted',true,'status','completed','verifiedScore',s.verified_score,'pointsAwarded',s.points_awarded);
  ELSIF s.status='review' THEN
    RETURN jsonb_build_object('accepted',false,'status','review','verifiedScore',s.verified_score,'pointsAwarded',0);
  ELSIF s.status<>'open' THEN
    RETURN jsonb_build_object('accepted',false,'status',s.status,'verifiedScore',0,'pointsAwarded',0);
  END IF;
  v_actual_ms := GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (now()-s.started_at))*1000)::integer);
  IF s.expires_at<=now() OR v_actual_ms>3600000 THEN
    UPDATE moadbook_games.sessions SET status='expired',ended_at=now() WHERE session_id=p_session_id;
    RETURN jsonb_build_object('accepted',false,'status','expired','verifiedScore',0,'pointsAwarded',0);
  END IF;
  IF p_duration_ms<0 OR p_duration_ms>v_actual_ms+15000 THEN v_reason:='duration_outside_session'; END IF;
  IF jsonb_typeof(COALESCE(p_metrics,'{}'::jsonb))<>'object' THEN v_reason:='invalid_metrics'; END IF;
  IF s.game_id='quiz' THEN
    SELECT count(*),count(*) FILTER (WHERE a.is_correct) INTO v_answers,v_correct
    FROM moadbook_games.session_questions q LEFT JOIN moadbook_games.session_answers a
      ON a.session_id=q.session_id AND a.question_id=q.question_id
    WHERE q.session_id=p_session_id AND a.session_id IS NOT NULL;
    v_score:=v_correct;
    IF v_answers<s.question_count THEN v_status:='partial';
    ELSIF p_client_score<>v_correct THEN v_reason:=COALESCE(v_reason,'quiz_score_mismatch'); END IF;
    IF v_actual_ms < s.question_count*250 THEN v_reason:=COALESCE(v_reason,'quiz_round_too_fast'); END IF;
  ELSIF s.game_id='runner' THEN
    v_distance:=moadbook_games.safe_int(p_metrics,'distanceMeters');
    v_coins:=moadbook_games.safe_int(p_metrics,'coins');
    v_dodged:=moadbook_games.safe_int(p_metrics,'obstaclesDodged');
    v_score:=GREATEST(0,LEAST(v_distance,1000000));
    IF abs(p_client_score-v_distance)>2 OR v_distance>FLOOR(v_actual_ms/1000.0*55+80)
       OR v_coins<0 OR v_coins>CEIL(v_actual_ms/1000.0*2+3)
       OR v_dodged<0 OR v_dodged>CEIL(v_actual_ms/1000.0*2+3) THEN
      v_reason:=COALESCE(v_reason,'runner_metrics_implausible');
    END IF;
  ELSIF s.game_id='memory' THEN
    v_pairs:=moadbook_games.safe_int(p_metrics,'matches');
    v_moves:=moadbook_games.safe_int(p_metrics,'moves');
    v_levels:=moadbook_games.safe_int(p_metrics,'levelsCompleted');
    v_score:=GREATEST(0,FLOOR((v_pairs*1000.0)/GREATEST(1,v_moves)+GREATEST(0,300-v_actual_ms/1000.0))::integer);
    IF v_pairs<>18 OR v_moves<v_pairs OR v_moves>500 OR v_levels<>3 OR abs(p_client_score-v_score)>5 THEN
      v_reason:=COALESCE(v_reason,'memory_metrics_implausible');
    END IF;
  ELSIF s.game_id='block-puzzle' THEN
    v_turns:=moadbook_games.safe_int(p_metrics,'turns');
    v_lines:=moadbook_games.safe_int(p_metrics,'linesCleared');
    v_levels:=moadbook_games.safe_int(p_metrics,'level');
    v_score:=p_client_score;
    IF v_turns<1 OR v_turns>10000 OR v_lines<0 OR v_lines>v_turns*2
       OR v_levels<>1+FLOOR(v_lines/4.0)::integer OR p_client_score>v_turns*5+v_lines*15 THEN
      v_reason:=COALESCE(v_reason,'block_metrics_implausible');
    END IF;
  ELSIF s.game_id='snake' THEN
    v_food:=moadbook_games.safe_int(p_metrics,'foodsEaten');
    v_moves:=moadbook_games.safe_int(p_metrics,'moves');
    v_score:=v_food*10;
    IF v_food<0 OR v_food>300 OR v_moves<v_food OR v_moves>FLOOR(v_actual_ms/1000.0*16+20)
       OR p_client_score<>v_score THEN v_reason:=COALESCE(v_reason,'snake_metrics_implausible'); END IF;
  END IF;
  IF v_reason IS NOT NULL THEN v_status:='review'; END IF;
  UPDATE moadbook_games.sessions SET status=v_status,ended_at=now(),client_score=p_client_score,
    verified_score=v_score,duration_ms=LEAST(v_actual_ms,86400000),metrics=COALESCE(p_metrics,'{}'::jsonb),review_reason=v_reason
  WHERE session_id=p_session_id;
  IF v_status='completed' THEN v_points:=moadbook_games.award_session_points(p_session_id); END IF;
  RETURN jsonb_build_object('accepted',v_status='completed','status',v_status,'verifiedScore',v_score,'pointsAwarded',v_points);
END
$$;
NOTIFY pgrst, 'reload schema';
