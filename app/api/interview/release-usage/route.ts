import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { releaseWeeklyInterviewReservation } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await releaseWeeklyInterviewReservation(userId);
  return NextResponse.json({ ok: true });
}