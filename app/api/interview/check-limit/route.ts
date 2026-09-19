import { auth } from '@clerk/nextjs/server';
import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { checkAndRecordWeeklyInterview, BILLING_CUTOFF_DATE } from '@/lib/rate-limit';
import { PRO_PLAN_SLUG } from '@/lib/plans';
import { track } from '@/lib/track';

export const runtime = 'nodejs';

export type InterviewLimitResponse =
  | { allowed: true; tier: 'pro' | 'legacy_free' | 'free' }
  | { allowed: false; tier: 'free' };

export async function POST(): Promise<NextResponse<InterviewLimitResponse | { error: string }>> {
  const { userId, has } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Pro subscription check
  // has() reads the JWT pla claim ("u:pro_plan") and strips the "u:" prefix internally.
  // Pass the slug directly — see lib/plans.ts for the ID vs slug distinction.
  {
    const isPro = has({ plan: PRO_PLAN_SLUG });
    if (isPro) {
      return NextResponse.json({ allowed: true, tier: 'pro' });
    }

    // Grace-period fallback: Clerk's JWT can take a few seconds to carry the new
    // billing claim after checkout. The verified subscription webhook stamps
    // publicMetadata.proGrantedAt; trust it for 5 minutes.
    try {
      const client = await clerkClient();
      const dbUser = await client.users.getUser(userId);
      const proGrantedAt = (dbUser.publicMetadata as Record<string, unknown>)?.proGrantedAt as number | undefined;
      const GRACE_MS = 5 * 60 * 1000;
      if (typeof proGrantedAt === 'number' && Date.now() - proGrantedAt < GRACE_MS) {
        return NextResponse.json({ allowed: true, tier: 'pro' });
      }
    } catch {
      // Clerk API unavailable — fall through to free-tier check
    }
  }

  // 2. Legacy-free grandfathering — users who signed up before billing launched
  const cutoffTs = BILLING_CUTOFF_DATE.getTime();
  if (!isNaN(cutoffTs)) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      if (user.createdAt < cutoffTs) {
        return NextResponse.json({ allowed: true, tier: 'legacy_free' });
      }
    } catch {
      // If Clerk API fails, fall through to the free-tier check rather than blocking
    }
  }

  // 3. Free tier — reserve a slot now so concurrent starts cannot overrun limits.
  const reservation = await checkAndRecordWeeklyInterview(userId);
  const allowed = reservation.allowed;

  if (!allowed) {
    track('interview_limit_hit', { tier: 'free', userId });
    return NextResponse.json({ allowed: false, tier: 'free' });
  }

  return NextResponse.json({ allowed: true, tier: 'free' });
}
