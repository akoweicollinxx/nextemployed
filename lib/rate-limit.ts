// Payment processor: Stripe (via Clerk Billing).
// VAT handling: Stripe Tax is enabled in the Stripe dashboard.
// EU/UK VAT is calculated automatically per customer location.
// For OSS quarterly filing, download tax reports from Stripe Tax → Reports.
// If Stripe Tax is ever disabled, VAT compliance becomes manual — do not disable without a plan.

import { redis } from '@/lib/redis';

// ─── IP daily limit ───────────────────────────────────────────────────────────

const IP_LIMIT = 3;

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rl:ip:${ip}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 24 * 60 * 60);
    return { allowed: count <= IP_LIMIT, remaining: Math.max(0, IP_LIMIT - count) };
  } catch (err) {
    console.error('[rate-limit] Redis error in checkRateLimit:', err);
    return { allowed: false, remaining: 0 };
  }
}

// ─── User daily limit ─────────────────────────────────────────────────────────

// Tune based on usage data
const USER_DAILY_LIMIT = 5;

export async function checkUserRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rl:ud:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 24 * 60 * 60);
    return { allowed: count <= USER_DAILY_LIMIT, remaining: Math.max(0, USER_DAILY_LIMIT - count) };
  } catch (err) {
    console.error('[rate-limit] Redis error in checkUserRateLimit:', err);
    return { allowed: false, remaining: 0 };
  }
}

// ─── User monthly tailored CV limit ──────────────────────────────────────────

// Free tier limit. When monetising, gate above this behind Stripe.
// Do not remove this limit silently — users on the free tier should still get 3.
export const TAILORED_CV_MONTHLY_LIMIT = 3;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthResetDate(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().split('T')[0];
}

export async function checkMonthlyUserRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetDate: string;
}> {
  const key = `rl:um:${userId}:${currentMonthKey()}`;
  const resetDate = getMonthResetDate();
  try {
    const count = await redis.incr(key);
    // 40-day TTL: key is unused next calendar month and self-destructs well after reset
    if (count === 1) await redis.expire(key, 40 * 24 * 60 * 60);
    const allowed = count <= TAILORED_CV_MONTHLY_LIMIT;
    return { allowed, remaining: Math.max(0, TAILORED_CV_MONTHLY_LIMIT - count), resetDate };
  } catch (err) {
    console.error('[rate-limit] Redis error in checkMonthlyUserRateLimit:', err);
    return { allowed: false, remaining: 0, resetDate };
  }
}

export async function getMonthlyUsage(userId: string): Promise<{ used: number; remaining: number; resetDate: string }> {
  const key = `rl:um:${userId}:${currentMonthKey()}`;
  const resetDate = getMonthResetDate();
  try {
    const count = await redis.get<number>(key);
    const used = count ?? 0;
    return { used, remaining: Math.max(0, TAILORED_CV_MONTHLY_LIMIT - used), resetDate };
  } catch (err) {
    console.error('[rate-limit] Redis error in getMonthlyUsage:', err);
    return { used: 0, remaining: TAILORED_CV_MONTHLY_LIMIT, resetDate };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK INTERVIEW WEEKLY LIMIT (billing gate — free tier only)
// ─────────────────────────────────────────────────────────────────────────────

// BILLING_CUTOFF_DATE — SET THIS TO YOUR EXACT LAUNCH DATE BEFORE DEPLOYING
//
// Users who signed up BEFORE this date are "legacy_free" and retain unlimited
// mock interviews regardless of subscription status.
//
// CRITICAL — getting this wrong:
//   Too early  (before any real users existed): nobody qualifies as legacy_free.
//              Existing users get 1 interview/week like new free users. Bad UX.
//   Too late   (still in the future on deploy): every signup until that date gets
//              unlimited interviews = free Pro tier. KILLS conversion. CRITICAL BUG.
//   Not set    (invalid date, as below): isNaN check fires, no grandfathering,
//              all free users get 1/week. Safest failure mode for launch.
//
// Set to the date you actually enable billing in production, e.g.:
//   export const BILLING_CUTOFF_DATE = new Date('2026-07-15T00:00:00Z');
export const BILLING_CUTOFF_DATE = new Date('TODO_SET_ON_DEPLOY');

if (typeof process !== 'undefined') {
  const ts = BILLING_CUTOFF_DATE.getTime();
  if (isNaN(ts)) {
    console.warn(
      '[NextEmployed] BILLING_CUTOFF_DATE is not set. ' +
      'Legacy-free grandfathering is disabled — set this before launch.'
    );
  } else if (ts > Date.now()) {
    console.error(
      '[NextEmployed] BILLING_CUTOFF_DATE is in the FUTURE. ' +
      'All new signups will get unlimited interviews until that date. Fix before launch!'
    );
  }
}

export const INTERVIEW_FREE_WEEKLY_LIMIT = 1;

const RESERVATION_TTL_S = 2 * 60; // 2 minutes

function currentWeekKey(): string {
  const now = new Date();
  const daysFromMonday = (now.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday));
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
}

function getWeekResetDate(): string {
  const now = new Date();
  const daysFromMonday = (now.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday));
  return new Date(mon.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// Reserves one weekly interview slot for a short window.
// Use this in preflight checks; confirm or release later.
// Uses SET NX to atomically prevent two concurrent starts from both getting allowed.
export async function checkAndRecordWeeklyInterview(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const countKey = `rl:iw:${userId}:${currentWeekKey()}`;
  const reservationKey = `rl:ir:${userId}`;
  try {
    const [countRaw, setResult] = await Promise.all([
      redis.get<number>(countKey),
      redis.set(reservationKey, '1', { nx: true, ex: RESERVATION_TTL_S }),
    ]);
    const used = countRaw ?? 0;

    if (used >= INTERVIEW_FREE_WEEKLY_LIMIT) {
      // Limit already consumed — clean up any reservation we may have just created
      if (setResult !== null) await redis.del(reservationKey);
      return { allowed: false, remaining: 0 };
    }

    if (setResult === null) {
      // SET NX failed: another reservation is in-flight for this user
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(0, INTERVIEW_FREE_WEEKLY_LIMIT - used - 1) };
  } catch (err) {
    console.error('[rate-limit] Redis error in checkAndRecordWeeklyInterview:', err);
    return { allowed: false, remaining: 0 };
  }
}

// Confirms a previously reserved slot. Returns false when no valid reservation exists.
export async function recordWeeklyInterviewUsed(userId: string): Promise<boolean> {
  const reservationKey = `rl:ir:${userId}`;
  const countKey = `rl:iw:${userId}:${currentWeekKey()}`;
  try {
    const deleted = await redis.del(reservationKey);
    if (deleted === 0) return false; // reservation expired or was never created

    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, 8 * 24 * 60 * 60); // 8 days
    return true;
  } catch (err) {
    console.error('[rate-limit] Redis error in recordWeeklyInterviewUsed:', err);
    return false;
  }
}

export async function releaseWeeklyInterviewReservation(userId: string): Promise<void> {
  try {
    await redis.del(`rl:ir:${userId}`);
  } catch (err) {
    console.error('[rate-limit] Redis error in releaseWeeklyInterviewReservation:', err);
  }
}

// Peek at usage without consuming a slot (used for UI state, not enforcement).
export async function peekWeeklyInterviewUsage(userId: string): Promise<{ used: number; resetDate: string }> {
  const countKey = `rl:iw:${userId}:${currentWeekKey()}`;
  const resetDate = getWeekResetDate();
  try {
    const count = await redis.get<number>(countKey);
    return { used: count ?? 0, resetDate };
  } catch (err) {
    console.error('[rate-limit] Redis error in peekWeeklyInterviewUsage:', err);
    return { used: 0, resetDate };
  }
}
