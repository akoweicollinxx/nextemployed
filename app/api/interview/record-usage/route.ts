import { auth } from '@clerk/nextjs/server';
import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  BILLING_CUTOFF_DATE,
  checkAndRecordWeeklyInterview,
  recordWeeklyInterviewUsed,
} from '@/lib/rate-limit';
import { PRO_PLAN_SLUG } from '@/lib/plans';

export const runtime = 'nodejs';

export async function POST() {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (has({ plan: PRO_PLAN_SLUG })) {
    return NextResponse.json({ ok: true });
  }

  const cutoffTs = BILLING_CUTOFF_DATE.getTime();
  if (!isNaN(cutoffTs)) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      if (user.createdAt < cutoffTs) {
        return NextResponse.json({ ok: true });
      }
    } catch {
      // Fall through and enforce the free-tier reservation flow.
    }
  }

  if (!await recordWeeklyInterviewUsed(userId)) {
    const reservation = await checkAndRecordWeeklyInterview(userId);
    if (!reservation.allowed || !await recordWeeklyInterviewUsed(userId)) {
      return NextResponse.json({ error: 'Weekly interview limit reached' }, { status: 429 });
    }
  }

  return NextResponse.json({ ok: true });
}
