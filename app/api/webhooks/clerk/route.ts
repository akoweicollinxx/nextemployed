import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { grantProEntitlement, revokeProEntitlement } from '@/lib/pro-entitlement';

export const runtime = 'nodejs';

function getStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function resolveSubscriptionUserId(payload: unknown): string | null {
  const direct = getStringField(payload, 'user_id');
  if (direct) return direct;
  const dataObj = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).data
    : null;
  return getStringField(dataObj, 'user_id');
}

function resolveSubscriptionStatus(payload: unknown): string {
  const direct = getStringField(payload, 'status');
  if (direct) return direct.toLowerCase();
  const dataObj = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).data
    : null;
  return (getStringField(dataObj, 'status') || '').toLowerCase();
}

function shouldGrant(type: string, status: string): boolean {
  if (!type.includes('subscription')) return false;
  return status === 'active' || status === 'trialing' || status === 'complete' || status === 'completed';
}

function shouldRevoke(type: string, status: string): boolean {
  if (!type.includes('subscription')) return false;
  if (type.includes('deleted') || type.includes('canceled') || type.includes('cancelled')) return true;
  return status === 'expired' || status === 'canceled' || status === 'cancelled';
}

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);
    const type = String((evt as { type?: unknown }).type ?? '').toLowerCase();
    if (!type.includes('subscription')) {
      return NextResponse.json({ ok: true });
    }

    const userId = resolveSubscriptionUserId(evt);
    if (!userId) {
      return NextResponse.json({ ok: true });
    }

    const status = resolveSubscriptionStatus(evt);
    if (shouldGrant(type, status)) {
      await grantProEntitlement(userId);
    } else if (shouldRevoke(type, status)) {
      await revokeProEntitlement(userId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[clerk-webhook] Failed to process event:', error);
    return NextResponse.json({ error: 'Invalid webhook request' }, { status: 400 });
  }
}