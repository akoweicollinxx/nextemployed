import { NextResponse } from 'next/server';
import { storeSubmission, SubmissionPayload } from '@/lib/submission-store';
import { track } from '@/lib/track';

export const runtime = 'nodejs';

const COOKIE_NAME = 'try_submission_id';
const MAX_CHARS = 8000;

export async function POST(req: Request) {
  let body: Partial<SubmissionPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { cvText, jobDescription, teaserResult, submittedAt } = body;

  if (
    typeof cvText !== 'string' || cvText.length < 50 ||
    typeof jobDescription !== 'string' || jobDescription.length < 50 ||
    typeof teaserResult !== 'string' ||
    typeof submittedAt !== 'number'
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload: SubmissionPayload = {
    cvText: cvText.slice(0, MAX_CHARS),
    jobDescription: jobDescription.slice(0, MAX_CHARS),
    teaserResult,
    submittedAt,
  };

  let id: string;
  try {
    id = await storeSubmission(payload);
  } catch (err) {
    console.error('[try/persist] Redis write failed:', err);
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  }

  track('try_submission_stored_server');

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour — matches Redis TTL
  });
  return res;
}
