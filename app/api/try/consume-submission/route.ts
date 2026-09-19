import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSubmission } from '@/lib/submission-store';
import { track } from '@/lib/track';

export const runtime = 'nodejs';

const COOKIE_NAME = 'try_submission_id';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const id = cookieStore.get(COOKIE_NAME)?.value;

  if (id) {
    try {
      await deleteSubmission(id);
    } catch (err) {
      console.error('[try/consume-submission] Redis delete failed:', err);
      // Non-fatal — the 1-hour TTL will clean it up
    }
  }

  track('try_submission_consumed');

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
