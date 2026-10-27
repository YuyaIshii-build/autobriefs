import { handleYoutubeUpload } from '@/lib/youtube/upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleYoutubeUpload(request);
}
