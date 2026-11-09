ALTER TABLE moadbook_games.game_catalog
  DROP CONSTRAINT IF EXISTS game_catalog_game_id_check;
ALTER TABLE moadbook_games.game_catalog
  ADD CONSTRAINT game_catalog_game_id_check
  CHECK (game_id IN ('runner','memory','quiz','block-puzzle','snake','tic-tac-toe'));

INSERT INTO moadbook_games.game_catalog
  (game_id,title,description,icon,accent,enabled,featured,sort_order,version)
VALUES
  ('tic-tac-toe','إكس أو: تحدّي الروبوت','كوّن صفًا من ثلاث خانات وتغلّب على خصم ذكي.','×','violet',true,true,60,'1.0.0')
ON CONFLICT (game_id) DO NOTHING;

CREATE OR REPLACE FUNCTION moadbook_games.tictactoe_has_win(p_board text[],p_mark text)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, moadbook_games
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      (1,2,3),(4,5,6),(7,8,9),(1,4,7),
      (2,5,8),(3,6,9),(1,5,9),(3,5,7)
    ) AS line(a,b,c)
    WHERE p_board[line.a]=p_mark AND p_board[line.b]=p_mark AND p_board[line.c]=p_mark
  )
$function$;

CREATE OR REPLACE FUNCTION moadbook_games.tictactoe_bot_move(p_board text[])
RETURNS integer LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, moadbook_games
AS $function$
DECLARE
  v_cell integer;
  v_try text[];
BEGIN
  IF cardinality(p_board)<>9 THEN RETURN NULL; END IF;
  FOR v_cell IN 1..9 LOOP
    IF COALESCE(p_board[v_cell],'')='' THEN
      v_try:=p_board; v_try[v_cell]:='O';
      IF moadbook_games.tictactoe_has_win(v_try,'O') THEN RETURN v_cell; END IF;
    END IF;
  END LOOP;
  FOR v_cell IN 1..9 LOOP
    IF COALESCE(p_board[v_cell],'')='' THEN
      v_try:=p_board; v_try[v_cell]:='X';
      IF moadbook_games.tictactoe_has_win(v_try,'X') THEN RETURN v_cell; END IF;
    END IF;
  END LOOP;
  IF COALESCE(p_board[5],'')='' THEN RETURN 5; END IF;
  FOREACH v_cell IN ARRAY ARRAY[1,3,7,9] LOOP
    IF COALESCE(p_board[v_cell],'')='' THEN RETURN v_cell; END IF;
  END LOOP;
  FOREACH v_cell IN ARRAY ARRAY[2,4,6,8] LOOP
    IF COALESCE(p_board[v_cell],'')='' THEN RETURN v_cell; END IF;
  END LOOP;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION moadbook_games.tictactoe_score(p_moves jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, moadbook_games
AS $function$
DECLARE
  v_board text[]:=ARRAY['','','','','','','','',''];
  v_length integer;
  v_move jsonb;
  v_ordinal bigint;
  v_numeric numeric;
  v_index integer;
  v_bot integer;
BEGIN
  IF p_moves IS NULL OR jsonb_typeof(p_moves) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  v_length:=jsonb_array_length(p_moves);
  IF v_length<1 OR v_length>5 THEN RETURN NULL; END IF;
  FOR v_move,v_ordinal IN
    SELECT value,ordinality FROM jsonb_array_elements(p_moves) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(v_move)<>'number' THEN RETURN NULL; END IF;
    v_numeric:=(v_move #>> '{}')::numeric;
    IF v_numeric<>trunc(v_numeric) OR v_numeric<0 OR v_numeric>8 THEN RETURN NULL; END IF;
    v_index:=v_numeric::integer+1;
    IF v_board[v_index]<>'' THEN RETURN NULL; END IF;
    v_board[v_index]:='X';
    IF moadbook_games.tictactoe_has_win(v_board,'X') THEN
      RETURN CASE WHEN v_ordinal=v_length THEN 100 ELSE NULL END;
    END IF;
    IF array_position(v_board,'') IS NULL THEN
      RETURN CASE WHEN v_ordinal=v_length THEN 50 ELSE NULL END;
    END IF;
    v_bot:=moadbook_games.tictactoe_bot_move(v_board);
    IF v_bot IS NULL THEN RETURN NULL; END IF;
    v_board[v_bot]:='O';
    IF moadbook_games.tictactoe_has_win(v_board,'O') THEN
      RETURN CASE WHEN v_ordinal=v_length THEN 10 ELSE NULL END;
    END IF;
    IF array_position(v_board,'') IS NULL THEN
      RETURN CASE WHEN v_ordinal=v_length THEN 50 ELSE NULL END;
    END IF;
  END LOOP;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION moadbook_games.tictactoe_has_win(text[],text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION moadbook_games.tictactoe_bot_move(text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION moadbook_games.tictactoe_score(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION moadbook_games.tictactoe_has_win(text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION moadbook_games.tictactoe_bot_move(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION moadbook_games.tictactoe_score(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.moadbook_games_finish_session(
  p_user_id text,p_session_id uuid,p_session_token uuid,p_client_score integer,p_duration_ms integer,p_metrics jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $function$
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
    v_score:=GREATEST(0,FLOOR((v_pairs*1000.0)/GREATEST(1,v_moves)+GREATEST(0,300-p_duration_ms/1000.0))::integer);
    IF v_pairs<>18 OR v_moves<v_pairs OR v_moves>500 OR v_levels<>3 OR p_client_score<>v_score THEN
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
  ELSIF s.game_id='tic-tac-toe' THEN
    v_score:=moadbook_games.tictactoe_score(p_metrics->'playerMoves');
    IF v_score IS NULL THEN
      v_score:=0; v_reason:=COALESCE(v_reason,'xo_moves_invalid');
    ELSIF p_client_score<>v_score THEN
      v_reason:=COALESCE(v_reason,'xo_score_mismatch');
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN v_status:='review'; END IF;
  UPDATE moadbook_games.sessions SET status=v_status,ended_at=now(),client_score=p_client_score,
    verified_score=v_score,duration_ms=LEAST(p_duration_ms,86400000),metrics=COALESCE(p_metrics,'{}'::jsonb),review_reason=v_reason
  WHERE session_id=p_session_id;
  IF v_status='completed' THEN v_points:=moadbook_games.award_session_points(p_session_id); END IF;
  RETURN jsonb_build_object('accepted',v_status='completed','status',v_status,'verifiedScore',v_score,'pointsAwarded',v_points);
END
$function$;

REVOKE ALL ON FUNCTION public.moadbook_games_finish_session(text,uuid,uuid,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.moadbook_games_finish_session(text,uuid,uuid,integer,integer,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
