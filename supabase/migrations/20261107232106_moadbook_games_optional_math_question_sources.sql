ALTER TABLE moadbook_games.question_bank
  ALTER COLUMN source_url DROP NOT NULL;

ALTER TABLE moadbook_games.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_source_url_check;

ALTER TABLE moadbook_games.question_bank
  ADD CONSTRAINT question_bank_source_url_check
  CHECK (source_url IS NULL OR source_url ~* '^https://');
