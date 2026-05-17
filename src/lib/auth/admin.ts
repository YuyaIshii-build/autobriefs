/**
 * 管理者 UI の表示制御（最小実装）。
 * 本格的な権限管理の前段として、環境変数で on/off します。
 *
 * 管理者の .env.local に設定:
 *   AUTO_BRIEFS_ADMIN=true
 *   NEXT_PUBLIC_AUTO_BRIEFS_ADMIN=true
 */
export function isAdminFromEnv(): boolean {
  const v = process.env.AUTO_BRIEFS_ADMIN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isAdminPublicEnv(): boolean {
  const v = process.env.NEXT_PUBLIC_AUTO_BRIEFS_ADMIN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
