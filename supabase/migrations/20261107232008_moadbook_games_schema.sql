CREATE SCHEMA IF NOT EXISTS moadbook_games;
REVOKE ALL ON SCHEMA moadbook_games FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA moadbook_games TO service_role;

CREATE TABLE IF NOT EXISTS moadbook_games.game_catalog (
  game_id text PRIMARY KEY CHECK (game_id IN ('runner','memory','quiz','block-puzzle','snake')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  icon text NOT NULL DEFAULT '✦',
  accent text NOT NULL DEFAULT 'violet' CHECK (accent IN ('mint','gold','blue','green','violet')),
  enabled boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  version text NOT NULL DEFAULT '1.0.0',
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.profiles (
  user_id text PRIMARY KEY CHECK (length(user_id) BETWEEN 1 AND 128),
  display_name text NOT NULL DEFAULT 'لاعب Moadbook' CHECK (length(display_name) BETWEEN 1 AND 80),
  username text NOT NULL DEFAULT '' CHECK (length(username) <= 40),
  total_points bigint NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  completed_rounds integer NOT NULL DEFAULT 0 CHECK (completed_rounds >= 0),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  last_play_date date,
  best_scores jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(best_scores) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.question_bank (
  question_id text PRIMARY KEY CHECK (length(question_id) BETWEEN 1 AND 80),
  category_id text NOT NULL CHECK (length(category_id) BETWEEN 1 AND 40),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1200),
  options text[] NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL CHECK (length(explanation) BETWEEN 1 AND 1200),
  source_title text NOT NULL CHECK (length(source_title) BETWEEN 1 AND 240),
  source_url text NOT NULL CHECK (source_url ~* '^https://'),
  source_evidence text NOT NULL CHECK (length(source_evidence) BETWEEN 1 AND 4000),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES moadbook_games.profiles(user_id) ON DELETE RESTRICT,
  game_id text NOT NULL REFERENCES moadbook_games.game_catalog(game_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','partial','review','rejected','cancelled','expired')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  client_score integer CHECK (client_score IS NULL OR client_score BETWEEN 0 AND 1000000),
  verified_score integer CHECK (verified_score IS NULL OR verified_score BETWEEN 0 AND 1000000),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count BETWEEN 0 AND 20),
  review_reason text,
  points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  points_awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.session_questions (
  session_id uuid NOT NULL REFERENCES moadbook_games.sessions(session_id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES moadbook_games.question_bank(question_id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
  category text NOT NULL,
  difficulty text NOT NULL,
  prompt text NOT NULL,
  options text[] NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  PRIMARY KEY (session_id, question_id),
  UNIQUE (session_id, position)
);

CREATE TABLE IF NOT EXISTS moadbook_games.session_answers (
  session_id uuid NOT NULL,
  question_id text NOT NULL,
  choice_index smallint NOT NULL CHECK (choice_index BETWEEN -1 AND 3),
  is_correct boolean NOT NULL,
  elapsed_ms integer NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 3600000),
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_id),
  FOREIGN KEY (session_id, question_id) REFERENCES moadbook_games.session_questions(session_id, question_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moadbook_games.achievements (
  achievement_id text PRIMARY KEY CHECK (length(achievement_id) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  icon text NOT NULL DEFAULT '✦',
  points integer NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 500),
  enabled boolean NOT NULL DEFAULT true,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rule) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.user_achievements (
  user_id text NOT NULL REFERENCES moadbook_games.profiles(user_id) ON DELETE RESTRICT,
  achievement_id text NOT NULL REFERENCES moadbook_games.achievements(achievement_id) ON DELETE RESTRICT,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS moadbook_games.points_ledger (
  ledger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES moadbook_games.profiles(user_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('round','perfect_quiz','achievement','daily_challenge')),
  source_id text NOT NULL,
  points integer NOT NULL CHECK (points BETWEEN 0 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, source_id)
);

CREATE TABLE IF NOT EXISTS moadbook_games.daily_challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES moadbook_games.game_catalog(game_id) ON DELETE RESTRICT,
  metric text NOT NULL CHECK (metric IN ('min_score','levels_completed','correct_answers','lines_cleared','foods_eaten','obstacles_dodged','moves','rounds_completed')),
  target integer NOT NULL CHECK (target BETWEEN 1 AND 1000000),
  reward_points integer NOT NULL CHECK (reward_points BETWEEN 0 AND 500),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  active_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, active_date)
);

CREATE TABLE IF NOT EXISTS moadbook_games.challenge_progress (
  user_id text NOT NULL REFERENCES moadbook_games.profiles(user_id) ON DELETE RESTRICT,
  challenge_id uuid NOT NULL REFERENCES moadbook_games.daily_challenges(challenge_id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at timestamptz,
  reward_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS moadbook_games.settings (
  key text PRIMARY KEY CHECK (key IN ('completion_points','perfect_quiz_points','daily_challenge_default_points')),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moadbook_games.admin_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id text NOT NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_sessions_user_status_date_idx ON moadbook_games.sessions(user_id, status, ended_at DESC);
CREATE INDEX IF NOT EXISTS games_sessions_game_status_date_idx ON moadbook_games.sessions(game_id, status, ended_at DESC);
CREATE INDEX IF NOT EXISTS games_sessions_review_idx ON moadbook_games.sessions(created_at DESC) WHERE status = 'review';
CREATE INDEX IF NOT EXISTS games_ledger_user_date_idx ON moadbook_games.points_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS games_questions_category_idx ON moadbook_games.question_bank(category, difficulty) WHERE enabled;
CREATE INDEX IF NOT EXISTS games_challenges_date_idx ON moadbook_games.daily_challenges(active_date, enabled);

INSERT INTO moadbook_games.game_catalog (game_id,title,description,icon,accent,enabled,featured,sort_order,version) VALUES
('runner','موآد رانر','اقفز، تفادَ العوائق، واجمع العملات لأبعد مسافة.','↗','mint',true,true,10,'1.0.0'),
('memory','تحدي الذاكرة','اكشف البطاقات وطابق الأزواج عبر ثلاثة مستويات.','◇','violet',true,true,20,'1.0.0'),
('quiz','موآد كويز','اختبار سريع في الحساب والمنطق، بإجابات يتحقق منها الخادم.','؟','gold',true,true,30,'1.0.0'),
('block-puzzle','تركيب القطع','ضع القطع وامسح الصفوف والأعمدة على لوحة 10×10.','▦','blue',true,false,40,'1.0.0'),
('snake','ثعبان مواد','اجمع الطعام، كبر بحذر، وحقق أفضل نتيجة.','⌁','green',true,false,50,'1.0.0')
ON CONFLICT (game_id) DO NOTHING;

INSERT INTO moadbook_games.achievements (achievement_id,name,description,icon,points,enabled,rule) VALUES
('first-verified-round','أول جولة موثقة','أكمل أول جولة موثقة من خادم Moadbook.','✓',10,true,'{"type":"first_round"}'::jsonb),
('quiz-perfect','خبير الاختبار','أجب عن أسئلة جولة Quiz كاملة إجابة صحيحة.','★',0,true,'{"type":"perfect_quiz"}'::jsonb),
('streak-7','أسبوع من اللعب','العب جولات موثقة في سبعة أيام متتالية.','◆',30,true,'{"type":"streak","days":7}'::jsonb),
('all-games','مستكشف الألعاب','أكمل جولة موثقة في الألعاب الخمس.','✦',40,true,'{"type":"all_games"}'::jsonb)
ON CONFLICT (achievement_id) DO NOTHING;

INSERT INTO moadbook_games.settings (key,value) VALUES
('completion_points','2'::jsonb),
('perfect_quiz_points','5'::jsonb),
('daily_challenge_default_points','20'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $rls$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'moadbook_games' LOOP
    EXECUTE format('ALTER TABLE moadbook_games.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE moadbook_games.%I FROM PUBLIC, anon, authenticated', t.tablename);
  END LOOP;
END
$rls$;
