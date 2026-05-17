import { NextResponse } from 'next/server';

import { isAdminFromEnv } from '@/lib/auth/admin';
import { getRequestUserKey } from '@/lib/auth/request-user';
import { getOrCreateAppUser } from '@/lib/db/app-users';

export async function GET(request: Request) {
  try {
    const userKey = getRequestUserKey(request);
    const user = await getOrCreateAppUser(userKey);
    return NextResponse.json({
      isAdmin: isAdminFromEnv(),
      userKey: user.user_key,
      displayName: user.user_key,
      locale: user.ui_locale,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ isAdmin: isAdminFromEnv(), error: msg }, { status: 500 });
  }
}
