-- Per-user UI locale (Basic Auth username or future auth subject).

CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key text NOT NULL UNIQUE,
  ui_locale text NOT NULL DEFAULT 'ja' CHECK (ui_locale IN ('ja', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER app_users_set_updated_at
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX app_users_user_key_idx ON public.app_users (user_key);
