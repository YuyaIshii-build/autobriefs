-- YouTube OAuth の Refresh Token を Railway の環境変数へ移すまでの一時置き場。
-- 行は id = 'current' の1件。取得 API が読んだ直後に削除する。
-- RLS を有効にし、ポリシーは作らない。anon / authenticated からは読めない。
-- アプリは service_role だけで読み書きする。service_role は RLS を迂回する。

CREATE TABLE public.youtube_oauth_handoff (
  id text PRIMARY KEY,
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT youtube_oauth_handoff_single_row CHECK (id = 'current')
);

ALTER TABLE public.youtube_oauth_handoff ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.youtube_oauth_handoff FROM anon, authenticated;
GRANT ALL ON TABLE public.youtube_oauth_handoff TO service_role;
