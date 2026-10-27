import { handleOauthVerify } from '@/lib/youtube/oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleOauthVerify(request);
}
