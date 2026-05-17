import { NextResponse } from 'next/server';

import { isAdminFromEnv } from '@/lib/auth/admin';

export async function GET() {
  return NextResponse.json({ isAdmin: isAdminFromEnv() });
}
