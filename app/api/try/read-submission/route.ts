import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSubmission } from '@/lib/submission-store';
import { track } from '@/lib/track';

export const runtime = 'nodejs';

const COOKIE_NAME = 'try_submission_id';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const id = cookieStore.get(COOKIE_NAME)?.value;

  if (!id) {
    return NextResponse.json({ orphaned: true }, { status: 404 });
  }

  let submission;
  try {
    submission = await getSubmission(id);
  } catch (err) {
    console.error('[try/read-submission] Redis read failed:', err);
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  }

  if (!submission) {
    // Expired or missing — clear the stale cookie
    const res = NextResponse.json({ orphaned: true }, { status: 404 });
    res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return res;
  }

  track('try_submission_read_server');
  return NextResponse.json(submission);
}
