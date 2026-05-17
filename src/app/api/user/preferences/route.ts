import { NextResponse } from 'next/server';

import { getRequestUserKey } from '@/lib/auth/request-user';
import { getOrCreateAppUser, updateAppUserLocale } from '@/lib/db/app-users';
import { parseLocale } from '@/lib/i18n/constants';

export async function GET(request: Request) {
  try {
    const userKey = getRequestUserKey(request);
    const user = await getOrCreateAppUser(userKey);
    return NextResponse.json({
      userKey: user.user_key,
      displayName: user.user_key,
      locale: user.ui_locale,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { locale?: unknown };
    const locale = parseLocale(typeof body.locale === 'string' ? body.locale : null);
    if (!locale) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    const userKey = getRequestUserKey(request);
    const user = await updateAppUserLocale(userKey, locale);

    const res = NextResponse.json({
      userKey: user.user_key,
      displayName: user.user_key,
      locale: user.ui_locale,
    });
    res.cookies.set('ab_ui_locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
