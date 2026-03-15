ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS user_context TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS llm_context TEXT;

UPDATE credentials
SET
  llm_context = CASE
    WHEN llm_context IS NULL OR llm_context = '' THEN selection_notes
    ELSE llm_context
  END,
  user_context = CASE
    WHEN user_context IS NULL OR user_context = '' THEN
      CASE
        WHEN llm_context IS NULL OR llm_context = '' THEN selection_notes
        ELSE llm_context
      END
    ELSE user_context
  END
WHERE llm_context IS NULL
   OR llm_context = ''
   OR user_context IS NULL
   OR user_context = '';

ALTER TABLE credentials
  ALTER COLUMN llm_context SET NOT NULL;

ALTER TABLE credentials
  ALTER COLUMN user_context SET NOT NULL;
