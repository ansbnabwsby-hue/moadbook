CREATE OR REPLACE FUNCTION moadbook_games.safe_int(p_json jsonb, p_key text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN COALESCE(p_json ->> p_key, '') ~ '^-?[0-9]{1,9}$'
    THEN (p_json ->> p_key)::integer ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION moadbook_games.award_points(p_user_id text, p_kind text, p_source_id text, p_points integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_points integer;
BEGIN
  INSERT INTO moadbook_games.points_ledger(user_id,kind,source_id,points)
  VALUES (p_user_id,p_kind,p_source_id,GREATEST(0,LEAST(COALESCE(p_points,0),100000)))
  ON CONFLICT (user_id,kind,source_id) DO NOTHING
  RETURNING points INTO v_points;
  IF FOUND THEN
    UPDATE moadbook_games.profiles SET total_points=total_points+v_points, updated_at=now()
    WHERE user_id=p_user_id;
    RETURN v_points;
  END IF;
  RETURN 0;
END
$$;

CREATE OR REPLACE FUNCTION moadbook_games.award_achievement(p_user_id text, p_achievement_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_points integer;
BEGIN
  SELECT points INTO v_points FROM moadbook_games.achievements
  WHERE achievement_id=p_achievement_id AND enabled;
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO moadbook_games.user_achievements(user_id,achievement_id)
  VALUES (p_user_id,p_achievement_id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  RETURN moadbook_games.award_points(p_user_id,'achievement',p_achievement_id,v_points);
END
$$;

CREATE OR REPLACE FUNCTION moadbook_games.award_session_points(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE
  s moadbook_games.sessions%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_streak integer;
  v_points integer := 0;
  v_amount integer;
  v_metric integer;
  c record;
BEGIN
  SELECT * INTO s FROM moadbook_games.sessions WHERE session_id=p_session_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'completed' OR s.points_awarded_at IS NOT NULL THEN RETURN 0; END IF;

  UPDATE moadbook_games.profiles p SET
    completed_rounds=p.completed_rounds+1,
    current_streak=CASE WHEN p.last_play_date=v_today THEN p.current_streak
                        WHEN p.last_play_date=v_today-1 THEN p.current_streak+1 ELSE 1 END,
    last_play_date=v_today,
    best_scores=CASE
      WHEN COALESCE((p.best_scores->>s.game_id)::integer,-1) < COALESCE(s.verified_score,0)
      THEN jsonb_set(p.best_scores,ARRAY[s.game_id],to_jsonb(COALESCE(s.verified_score,0)),true)
      ELSE p.best_scores END,
    updated_at=now()
  WHERE p.user_id=s.user_id
  RETURNING current_streak INTO v_streak;

  SELECT COALESCE((value #>> '{}')::integer,2) INTO v_amount
  FROM moadbook_games.settings WHERE key='completion_points';
  v_points := v_points + moadbook_games.award_points(s.user_id,'round',s.session_id::text,COALESCE(v_amount,2));

  IF s.game_id='quiz' AND s.question_count>0 AND s.verified_score=s.question_count THEN
    SELECT COALESCE((value #>> '{}')::integer,5) INTO v_amount
    FROM moadbook_games.settings WHERE key='perfect_quiz_points';
    v_points := v_points + moadbook_games.award_points(s.user_id,'perfect_quiz',s.session_id::text,COALESCE(v_amount,5));
    v_points := v_points + moadbook_games.award_achievement(s.user_id,'quiz-perfect');
  END IF;

  IF (SELECT completed_rounds FROM moadbook_games.profiles WHERE user_id=s.user_id)=1 THEN
    v_points := v_points + moadbook_games.award_achievement(s.user_id,'first-verified-round');
  END IF;
  IF COALESCE(v_streak,0)>=7 THEN
    v_points := v_points + moadbook_games.award_achievement(s.user_id,'streak-7');
  END IF;
  IF (SELECT count(DISTINCT game_id) FROM moadbook_games.sessions
      WHERE user_id=s.user_id AND status='completed')=5 THEN
    v_points := v_points + moadbook_games.award_achievement(s.user_id,'all-games');
  END IF;

  FOR c IN SELECT challenge_id,metric,target,reward_points FROM moadbook_games.daily_challenges
           WHERE game_id=s.game_id AND active_date=v_today AND enabled
  LOOP
    v_metric := CASE c.metric
      WHEN 'min_score' THEN COALESCE(s.verified_score,0)
      WHEN 'levels_completed' THEN moadbook_games.safe_int(s.metrics,'levelsCompleted')
      WHEN 'correct_answers' THEN COALESCE(s.verified_score,0)
      WHEN 'lines_cleared' THEN moadbook_games.safe_int(s.metrics,'linesCleared')
      WHEN 'foods_eaten' THEN moadbook_games.safe_int(s.metrics,'foodsEaten')
      WHEN 'obstacles_dodged' THEN moadbook_games.safe_int(s.metrics,'obstaclesDodged')
      WHEN 'moves' THEN moadbook_games.safe_int(s.metrics,'moves')
      WHEN 'rounds_completed' THEN 1
      ELSE 0 END;
    INSERT INTO moadbook_games.challenge_progress(user_id,challenge_id,progress)
    VALUES (s.user_id,c.challenge_id,GREATEST(0,v_metric))
    ON CONFLICT (user_id,challenge_id) DO UPDATE SET
      progress=GREATEST(moadbook_games.challenge_progress.progress,EXCLUDED.progress),updated_at=now();
    UPDATE moadbook_games.challenge_progress cp SET
      completed_at=COALESCE(cp.completed_at,now()),reward_claimed=true,updated_at=now()
    WHERE cp.user_id=s.user_id AND cp.challenge_id=c.challenge_id
      AND cp.progress>=c.target AND NOT cp.reward_claimed;
    IF FOUND THEN
      v_points := v_points + moadbook_games.award_points(s.user_id,'daily_challenge',c.challenge_id::text,c.reward_points);
    END IF;
  END LOOP;

  UPDATE moadbook_games.sessions SET points_awarded=v_points,points_awarded_at=now()
  WHERE session_id=s.session_id;
  RETURN v_points;
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_catalog()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
  SELECT jsonb_build_object('games',COALESCE(jsonb_agg(jsonb_build_object(
    'id',game_id,'name',title,'description',description,'icon',icon,'accent',accent,
    'enabled',enabled,'featured',featured,'version',version,'imageUrl',config->>'imageUrl'
  ) ORDER BY sort_order),'[]'::jsonb))
  FROM moadbook_games.game_catalog WHERE enabled
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_start_session(
  p_user_id text,p_display_name text,p_username text,p_game_id text,p_options jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE
  v_game moadbook_games.game_catalog%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_category text;
  v_difficulty text;
  v_count integer;
  v_ids text[];
  v_questions jsonb := '[]'::jsonb;
  v_started timestamptz := now();
BEGIN
  IF p_user_id IS NULL OR length(p_user_id)>128 THEN RAISE EXCEPTION 'invalid_user'; END IF;
  SELECT * INTO v_game FROM moadbook_games.game_catalog WHERE game_id=p_game_id AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_unavailable'; END IF;
  INSERT INTO moadbook_games.profiles(user_id,display_name,username)
  VALUES (p_user_id,COALESCE(NULLIF(left(btrim(p_display_name),80),''),'لاعب Moadbook'),left(COALESCE(p_username,''),40))
  ON CONFLICT (user_id) DO UPDATE SET
    display_name=COALESCE(NULLIF(left(btrim(EXCLUDED.display_name),80),''),moadbook_games.profiles.display_name),
    username=COALESCE(NULLIF(EXCLUDED.username,''),moadbook_games.profiles.username),updated_at=now();
  PERFORM 1 FROM moadbook_games.profiles WHERE user_id=p_user_id FOR UPDATE;
  IF (SELECT count(*) FROM moadbook_games.sessions WHERE user_id=p_user_id AND status='open' AND started_at>now()-interval '1 hour')>=3 THEN
    RAISE EXCEPTION 'too_many_open_sessions';
  END IF;
  IF (SELECT count(*) FROM moadbook_games.sessions WHERE user_id=p_user_id AND status='completed' AND ended_at>(now() AT TIME ZONE 'UTC')::date::timestamptz)>=100 THEN
    RAISE EXCEPTION 'daily_session_limit';
  END IF;

  IF p_game_id='quiz' THEN
    v_category := NULLIF(btrim(p_options->>'category'),'');
    IF v_category IN ('الكل','عام') THEN v_category := NULL; END IF;
    v_difficulty := CASE p_options->>'difficulty'
      WHEN 'سهل' THEN 'easy' WHEN 'متوسط' THEN 'medium' WHEN 'صعب' THEN 'hard'
      WHEN 'الكل' THEN NULL ELSE NULLIF(p_options->>'difficulty','') END;
    v_count := GREATEST(1,LEAST(COALESCE((p_options->>'count')::integer,6),10));
    SELECT array_agg(question_id) INTO v_ids FROM (
      SELECT question_id FROM moadbook_games.question_bank
      WHERE enabled AND (v_category IS NULL OR category=v_category)
        AND (v_difficulty IS NULL OR difficulty=v_difficulty)
      ORDER BY random() LIMIT v_count
    ) q;
    IF COALESCE(cardinality(v_ids),0)=0 THEN RETURN jsonb_build_object('session',NULL); END IF;
  END IF;

  INSERT INTO moadbook_games.sessions(session_id,session_token,user_id,game_id,options,started_at,expires_at,question_count)
  VALUES (v_id,v_token,p_user_id,p_game_id,COALESCE(p_options,'{}'::jsonb),v_started,v_started+interval '1 hour',COALESCE(cardinality(v_ids),0));
  IF p_game_id='quiz' THEN
    INSERT INTO moadbook_games.session_questions(session_id,question_id,position,category,difficulty,prompt,options,correct_index,explanation)
    SELECT v_id,q.question_id,ordinality::smallint,q.category,q.difficulty,q.prompt,q.options,q.correct_index,q.explanation
    FROM unnest(v_ids) WITH ORDINALITY AS picked(question_id,ordinality)
    JOIN moadbook_games.question_bank q USING(question_id);
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',question_id,'category',category,'difficulty',difficulty,'prompt',prompt,'options',to_jsonb(options)
    ) ORDER BY position),'[]'::jsonb) INTO v_questions
    FROM moadbook_games.session_questions WHERE session_id=v_id;
  END IF;
  RETURN jsonb_build_object('session',jsonb_build_object(
    'id',v_id,'sessionToken',v_token,'gameId',p_game_id,'startedAt',v_started,'expiresAt',v_started+interval '1 hour',
    'data',jsonb_build_object('questions',v_questions)
  ));
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_cancel_session(p_user_id text,p_session_id uuid,p_session_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_cancelled boolean := false;
BEGIN
  UPDATE moadbook_games.sessions SET status=CASE WHEN expires_at>now() THEN 'cancelled' ELSE 'expired' END,ended_at=now()
  WHERE session_id=p_session_id AND session_token=p_session_token AND user_id=p_user_id AND status='open';
  v_cancelled := FOUND;
  RETURN jsonb_build_object('cancelled',v_cancelled);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_answer_question(
  p_user_id text,p_session_id uuid,p_session_token uuid,p_question_id text,p_choice_index integer,p_elapsed_ms integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_session moadbook_games.sessions%ROWTYPE; v_question moadbook_games.session_questions%ROWTYPE; v_correct boolean;
BEGIN
  SELECT * INTO v_session FROM moadbook_games.sessions
  WHERE session_id=p_session_id AND session_token=p_session_token AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_session.game_id<>'quiz' OR v_session.status<>'open' THEN RAISE EXCEPTION 'quiz_session_invalid'; END IF;
  IF v_session.expires_at<=now() THEN
    UPDATE moadbook_games.sessions SET status='expired',ended_at=now() WHERE session_id=p_session_id;
    RAISE EXCEPTION 'session_expired';
  END IF;
  IF p_choice_index NOT BETWEEN -1 AND 3 OR p_elapsed_ms NOT BETWEEN 0 AND 3600000 THEN RAISE EXCEPTION 'invalid_answer'; END IF;
  SELECT * INTO v_question FROM moadbook_games.session_questions
  WHERE session_id=p_session_id AND question_id=p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_in_session'; END IF;
  v_correct := p_choice_index>=0 AND p_choice_index=v_question.correct_index;
  INSERT INTO moadbook_games.session_answers(session_id,question_id,choice_index,is_correct,elapsed_ms)
  VALUES (p_session_id,p_question_id,p_choice_index,v_correct,p_elapsed_ms)
  ON CONFLICT (session_id,question_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'correct',false,'explanation',''); END IF;
  RETURN jsonb_build_object('accepted',true,'correct',v_correct,'explanation',v_question.explanation);
END
$$;

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
  END IF;

  IF v_reason IS NOT NULL THEN v_status:='review'; END IF;
  UPDATE moadbook_games.sessions SET status=v_status,ended_at=now(),client_score=p_client_score,
    verified_score=v_score,duration_ms=LEAST(p_duration_ms,86400000),metrics=COALESCE(p_metrics,'{}'::jsonb),review_reason=v_reason
  WHERE session_id=p_session_id;
  IF v_status='completed' THEN v_points:=moadbook_games.award_session_points(p_session_id); END IF;
  RETURN jsonb_build_object('accepted',v_status='completed','status',v_status,'verifiedScore',v_score,'pointsAwarded',v_points);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_dashboard(p_user_id text,p_display_name text,p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_profile jsonb; v_challenges jsonb; v_achievements jsonb; v_recent jsonb;
BEGIN
  INSERT INTO moadbook_games.profiles(user_id,display_name,username)
  VALUES (p_user_id,COALESCE(NULLIF(left(btrim(p_display_name),80),''),'لاعب Moadbook'),left(COALESCE(p_username,''),40))
  ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name,username=EXCLUDED.username,updated_at=now();
  SELECT jsonb_build_object('userId',user_id,'displayName',display_name,'totalPoints',total_points,
    'completedRounds',completed_rounds,'currentStreak',current_streak,'bestScores',best_scores)
  INTO v_profile FROM moadbook_games.profiles WHERE user_id=p_user_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.challenge_id,'gameId',c.game_id,'title',c.title,
    'metric',c.metric,'target',c.target,'rewardPoints',c.reward_points,'progress',COALESCE(p.progress,0),
    'completed',COALESCE(p.reward_claimed,false)) ORDER BY c.game_id),'[]'::jsonb)
  INTO v_challenges FROM moadbook_games.daily_challenges c
  LEFT JOIN moadbook_games.challenge_progress p ON p.challenge_id=c.challenge_id AND p.user_id=p_user_id
  WHERE c.active_date=(now() AT TIME ZONE 'UTC')::date AND c.enabled;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.achievement_id,'name',a.name,'description',a.description,
    'icon',a.icon,'points',a.points,'earned',u.user_id IS NOT NULL,'earnedAt',u.earned_at)
    ORDER BY u.earned_at DESC NULLS LAST,a.name),'[]'::jsonb)
  INTO v_achievements FROM moadbook_games.achievements a
  LEFT JOIN moadbook_games.user_achievements u ON u.achievement_id=a.achievement_id AND u.user_id=p_user_id
  WHERE a.enabled;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('gameId',s.game_id,'score',s.verified_score,'createdAt',s.ended_at)
    ORDER BY s.ended_at DESC),'[]'::jsonb)
  INTO v_recent FROM (SELECT game_id,verified_score,ended_at FROM moadbook_games.sessions
    WHERE user_id=p_user_id AND status='completed' ORDER BY ended_at DESC LIMIT 10) s;
  RETURN jsonb_build_object('profile',v_profile,'dailyChallenges',v_challenges,'achievements',v_achievements,'recentScores',v_recent);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_leaderboard(p_user_id text,p_game_id text,p_period text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_rows jsonb;
BEGIN
  IF p_period NOT IN ('all-time','weekly','monthly') THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF p_game_id IS NULL THEN
    WITH totals AS (
      SELECT p.user_id,p.display_name,COALESCE(sum(l.points),0)::bigint AS score
      FROM moadbook_games.profiles p LEFT JOIN moadbook_games.points_ledger l ON l.user_id=p.user_id
        AND (p_period='all-time' OR (p_period='weekly' AND l.created_at>=date_trunc('week',now()))
          OR (p_period='monthly' AND l.created_at>=date_trunc('month',now())))
      GROUP BY p.user_id,p.display_name HAVING COALESCE(sum(l.points),0)>0
    ), ranked AS (
      SELECT row_number() OVER (ORDER BY score DESC,display_name,user_id)::integer AS rank,
        user_id,display_name,score FROM totals
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('rank',rank,'userId',user_id,'displayName',display_name,
      'gameName','Moadbook Games','score',score,'totalPoints',score) ORDER BY rank),'[]'::jsonb)
    INTO v_rows FROM ranked WHERE rank<=LEAST(GREATEST(p_limit,1),100) OR user_id=p_user_id;
  ELSE
    WITH best AS (
      SELECT s.user_id,MAX(s.verified_score)::bigint AS score
      FROM moadbook_games.sessions s WHERE s.game_id=p_game_id AND s.status='completed'
        AND (p_period='all-time' OR (p_period='weekly' AND s.ended_at>=date_trunc('week',now()))
          OR (p_period='monthly' AND s.ended_at>=date_trunc('month',now())))
      GROUP BY s.user_id
    ), ranked AS (
      SELECT row_number() OVER (ORDER BY b.score DESC,p.display_name,b.user_id)::integer AS rank,
        b.user_id,p.display_name,b.score,g.title AS game_name
      FROM best b JOIN moadbook_games.profiles p USING(user_id)
      JOIN moadbook_games.game_catalog g ON g.game_id=p_game_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('rank',rank,'userId',user_id,'displayName',display_name,
      'gameName',game_name,'score',score) ORDER BY rank),'[]'::jsonb)
    INTO v_rows FROM ranked WHERE rank<=LEAST(GREATEST(p_limit,1),100) OR user_id=p_user_id;
  END IF;
  RETURN jsonb_build_object('rows',v_rows);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_overview(p_admin_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_games jsonb; v_achievements jsonb; v_questions jsonb; v_review jsonb; v_settings jsonb; v_stats jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',game_id,'name',title,'description',description,
    'icon',icon,'accent',accent,'enabled',enabled,'featured',featured,'version',version,'sortOrder',sort_order,
    'imageUrl',config->>'imageUrl')
    ORDER BY sort_order),'[]'::jsonb) INTO v_games FROM moadbook_games.game_catalog;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',achievement_id,'name',name,'description',description,
    'icon',icon,'points',points,'enabled',enabled) ORDER BY name),'[]'::jsonb)
  INTO v_achievements FROM moadbook_games.achievements;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',question_id,'categoryId',category_id,'category',category,
    'difficulty',difficulty,'prompt',prompt,'enabled',enabled,'sourceTitle',source_title,'sourceUrl',source_url,
    'sourceEvidence',source_evidence) ORDER BY category,question_id),'[]'::jsonb)
  INTO v_questions FROM (SELECT * FROM moadbook_games.question_bank ORDER BY category,question_id LIMIT 100) q;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.session_id,'gameId',s.game_id,'clientScore',s.client_score,
    'verifiedScore',s.verified_score,'reviewReason',s.review_reason,'displayName',p.display_name,
    'createdAt',s.created_at) ORDER BY s.created_at),'[]'::jsonb)
  INTO v_review FROM (SELECT * FROM moadbook_games.sessions WHERE status='review' ORDER BY created_at LIMIT 50) s
  JOIN moadbook_games.profiles p USING(user_id);
  SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) INTO v_settings FROM moadbook_games.settings;
  SELECT jsonb_build_object(
    'players',(SELECT count(*) FROM moadbook_games.profiles),
    'completedRounds',(SELECT count(*) FROM moadbook_games.sessions WHERE status='completed'),
    'pointsAwarded',(SELECT COALESCE(sum(points),0) FROM moadbook_games.points_ledger),
    'reviewQueue',(SELECT count(*) FROM moadbook_games.sessions WHERE status='review'),
    'sessionsToday',(SELECT count(*) FROM moadbook_games.sessions WHERE started_at >= (now() AT TIME ZONE 'UTC')::date::timestamptz)
  ) INTO v_stats;
  RETURN jsonb_build_object('games',v_games,'achievements',v_achievements,'questions',v_questions,
    'reviewQueue',v_review,'settings',v_settings,'stats',v_stats);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_save_game(p_admin_user_id text,p_game_id text,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_game moadbook_games.game_catalog%ROWTYPE;
BEGIN
  UPDATE moadbook_games.game_catalog SET
    title=CASE WHEN p_patch?'title' THEN left(p_patch->>'title',120) ELSE title END,
    description=CASE WHEN p_patch?'description' THEN left(p_patch->>'description',1000) ELSE description END,
    icon=CASE WHEN p_patch?'icon' THEN left(p_patch->>'icon',32) ELSE icon END,
    accent=CASE WHEN p_patch?'accent' THEN p_patch->>'accent' ELSE accent END,
    version=CASE WHEN p_patch?'version' THEN left(p_patch->>'version',40) ELSE version END,
    config=CASE WHEN p_patch?'image_url' AND COALESCE(p_patch->>'image_url','')=''
      THEN config-'imageUrl'
      WHEN p_patch?'image_url' THEN jsonb_set(config,'{imageUrl}',to_jsonb(p_patch->>'image_url'),true)
      ELSE config END,
    enabled=CASE WHEN p_patch?'enabled' THEN (p_patch->>'enabled')::boolean ELSE enabled END,
    featured=CASE WHEN p_patch?'featured' THEN (p_patch->>'featured')::boolean ELSE featured END,
    sort_order=CASE WHEN p_patch?'sort_order' THEN LEAST(10000,GREATEST(0,(p_patch->>'sort_order')::integer)) ELSE sort_order END,
    updated_at=now() WHERE game_id=p_game_id RETURNING * INTO v_game;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'save_game',p_game_id,p_patch);
  RETURN jsonb_build_object('saved',true,'id',v_game.game_id,'enabled',v_game.enabled,'featured',v_game.featured);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_save_achievement(p_admin_user_id text,p_id text,p_points integer,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
BEGIN
  UPDATE moadbook_games.achievements SET points=LEAST(500,GREATEST(0,p_points)),enabled=p_enabled,updated_at=now()
  WHERE achievement_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'achievement_not_found'; END IF;
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'save_achievement',p_id,jsonb_build_object('points',p_points,'enabled',p_enabled));
  RETURN jsonb_build_object('saved',true);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_review_score(p_admin_user_id text,p_score_id uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE s moadbook_games.sessions%ROWTYPE; v_points integer := 0;
BEGIN
  SELECT * INTO s FROM moadbook_games.sessions WHERE session_id=p_score_id AND status='review' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF p_decision='approve' THEN
    UPDATE moadbook_games.sessions SET status='completed',review_reason=NULL,ended_at=COALESCE(ended_at,now()) WHERE session_id=p_score_id;
    v_points:=moadbook_games.award_session_points(p_score_id);
  ELSIF p_decision='reject' THEN
    UPDATE moadbook_games.sessions SET status='rejected',ended_at=COALESCE(ended_at,now()) WHERE session_id=p_score_id;
  ELSE RAISE EXCEPTION 'invalid_decision'; END IF;
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'review_score',p_score_id::text,jsonb_build_object('decision',p_decision));
  RETURN jsonb_build_object('accepted',p_decision='approve','status',CASE WHEN p_decision='approve' THEN 'completed' ELSE 'rejected' END,
    'verifiedScore',s.verified_score,'pointsAwarded',v_points);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_save_question(p_admin_user_id text,p_question jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_id text := COALESCE(NULLIF(p_question->>'id',''),gen_random_uuid()::text); v_options text[];
BEGIN
  SELECT ARRAY(SELECT jsonb_array_elements_text(p_question->'choices')) INTO v_options;
  IF cardinality(v_options)<>4 OR p_question->>'game_id'<>'quiz'
     OR (p_question->>'source_url' IS NULL AND p_question->>'category_id'<>'math')
     OR (p_question->>'source_url' IS NOT NULL AND p_question->>'source_url' !~* '^https://')
  THEN RAISE EXCEPTION 'invalid_question'; END IF;
  INSERT INTO moadbook_games.question_bank(question_id,category_id,category,difficulty,prompt,options,correct_index,
    explanation,source_title,source_url,source_evidence,enabled)
  VALUES(v_id,p_question->>'category_id',p_question->>'category',p_question->>'difficulty',p_question->>'prompt',
    v_options,(p_question->>'answer_index')::smallint,COALESCE(p_question->>'explanation',''),
    p_question->>'source_title',p_question->>'source_url',p_question->>'evidence',COALESCE((p_question->>'enabled')::boolean,true))
  ON CONFLICT(question_id) DO UPDATE SET category_id=EXCLUDED.category_id,category=EXCLUDED.category,
    difficulty=EXCLUDED.difficulty,prompt=EXCLUDED.prompt,options=EXCLUDED.options,correct_index=EXCLUDED.correct_index,
    explanation=EXCLUDED.explanation,source_title=EXCLUDED.source_title,source_url=EXCLUDED.source_url,
    source_evidence=EXCLUDED.source_evidence,enabled=EXCLUDED.enabled,updated_at=now();
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'save_question',v_id,jsonb_build_object('categoryId',p_question->>'category_id','sourceTitle',p_question->>'source_title'));
  RETURN jsonb_build_object('saved',true,'id',v_id);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_toggle_question(p_admin_user_id text,p_question_id text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
BEGIN
  UPDATE moadbook_games.question_bank SET enabled=p_enabled,updated_at=now() WHERE question_id=p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_found'; END IF;
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'toggle_question',p_question_id,jsonb_build_object('enabled',p_enabled));
  RETURN jsonb_build_object('saved',true);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_save_challenge(
  p_admin_user_id text,p_game_id text,p_metric text,p_target integer,p_reward_points integer,p_title text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_metric NOT IN ('min_score','levels_completed','correct_answers','lines_cleared','foods_eaten','obstacles_dodged','moves','rounds_completed')
     OR p_target NOT BETWEEN 1 AND 1000000 OR p_reward_points NOT BETWEEN 0 AND 500 THEN RAISE EXCEPTION 'invalid_challenge'; END IF;
  INSERT INTO moadbook_games.daily_challenges(game_id,metric,target,reward_points,title,active_date,enabled)
  VALUES(p_game_id,p_metric,p_target,p_reward_points,left(p_title,160),(now() AT TIME ZONE 'UTC')::date,true)
  ON CONFLICT(game_id,active_date) DO UPDATE SET metric=EXCLUDED.metric,target=EXCLUDED.target,
    reward_points=EXCLUDED.reward_points,title=EXCLUDED.title,enabled=true
  RETURNING challenge_id INTO v_id;
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'save_challenge',v_id::text,jsonb_build_object('gameId',p_game_id,'metric',p_metric,'target',p_target,'rewardPoints',p_reward_points));
  RETURN jsonb_build_object('saved',true,'id',v_id);
END
$$;

CREATE OR REPLACE FUNCTION public.moadbook_games_admin_save_setting(p_admin_user_id text,p_key text,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, moadbook_games
AS $$
DECLARE v_value integer;
BEGIN
  IF p_key NOT IN ('completion_points','perfect_quiz_points','daily_challenge_default_points')
     OR jsonb_typeof(p_value)<>'number' THEN RAISE EXCEPTION 'invalid_setting'; END IF;
  v_value:=(p_value #>> '{}')::integer;
  IF (p_key='completion_points' AND v_value NOT BETWEEN 0 AND 50)
     OR (p_key='perfect_quiz_points' AND v_value NOT BETWEEN 0 AND 200)
     OR (p_key='daily_challenge_default_points' AND v_value NOT BETWEEN 0 AND 500) THEN RAISE EXCEPTION 'setting_out_of_range'; END IF;
  INSERT INTO moadbook_games.settings(key,value,updated_at) VALUES(p_key,to_jsonb(v_value),now())
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  INSERT INTO moadbook_games.admin_audit(admin_user_id,action,target_id,details)
  VALUES(p_admin_user_id,'save_setting',p_key,jsonb_build_object('value',v_value));
  RETURN jsonb_build_object('saved',true,'key',p_key,'value',v_value);
END
$$;

REVOKE ALL ON FUNCTION public.moadbook_games_catalog() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_start_session(text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_cancel_session(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_answer_question(text,uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_finish_session(text,uuid,uuid,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_dashboard(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_leaderboard(text,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_overview(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_save_game(text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_save_achievement(text,text,integer,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_review_score(text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_save_question(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_toggle_question(text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_save_challenge(text,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.moadbook_games_admin_save_setting(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.moadbook_games_catalog() TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_start_session(text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_cancel_session(text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_answer_question(text,uuid,uuid,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_finish_session(text,uuid,uuid,integer,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_dashboard(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_leaderboard(text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_overview(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_save_game(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_save_achievement(text,text,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_review_score(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_save_question(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_toggle_question(text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_save_challenge(text,text,text,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.moadbook_games_admin_save_setting(text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION moadbook_games.safe_int(jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION moadbook_games.award_points(text,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION moadbook_games.award_achievement(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION moadbook_games.award_session_points(uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
