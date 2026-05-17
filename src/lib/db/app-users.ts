import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Locale } from '@/lib/i18n/constants';

export type AppUserRow = {
  user_key: string;
  ui_locale: Locale;
};

export async function getOrCreateAppUser(userKey: string): Promise<AppUserRow> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readErr } = await supabase
    .from('app_users')
    .select('user_key, ui_locale')
    .eq('user_key', userKey)
    .maybeSingle();

  if (readErr) {
    throw new Error(readErr.message);
  }
  if (existing) {
    return existing as AppUserRow;
  }

  const { data: created, error: insertErr } = await supabase
    .from('app_users')
    .insert({ user_key: userKey, ui_locale: 'ja' })
    .select('user_key, ui_locale')
    .single();

  if (insertErr) {
    throw new Error(insertErr.message);
  }

  return created as AppUserRow;
}

export async function updateAppUserLocale(userKey: string, locale: Locale): Promise<AppUserRow> {
  const supabase = getSupabaseAdmin();

  await getOrCreateAppUser(userKey);

  const { data, error } = await supabase
    .from('app_users')
    .update({ ui_locale: locale })
    .eq('user_key', userKey)
    .select('user_key, ui_locale')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AppUserRow;
}
