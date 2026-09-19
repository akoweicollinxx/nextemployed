'use client';

import { useEffect } from 'react';
import { useAuth, useUser, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { track } from '@/lib/track';
import { PRO_PLAN_SLUG } from '@/lib/plans';

// Keys cleared on user change to prevent data leaking between accounts.
// nextemployed_try_submission is now in Redis (server-side); nothing to clear here.
// nextemployed_jd_context lives in sessionStorage (interview page only, no auth transition).
const USER_SCOPED_LOCAL_STORAGE_KEYS: string[] = [];
const USER_SCOPED_SESSION_STORAGE_KEYS = ['nextemployed_jd_context'];
const STORAGE_OWNER_USER_KEY = 'nextemployed_storage_owner_user_id';

export function UserNav() {
  const { isSignedIn, isLoaded, has, userId } = useAuth();
  const { user } = useUser();

  // Wipe session storage whenever ownership changes across mounts/remounts.
  useEffect(() => {
    if (!isLoaded) return;

    const current = userId ?? '';
    try {
      const storedOwner = sessionStorage.getItem(STORAGE_OWNER_USER_KEY);
      if (storedOwner !== null && storedOwner !== current) {
        USER_SCOPED_SESSION_STORAGE_KEYS.forEach(k => sessionStorage.removeItem(k));
        try { USER_SCOPED_LOCAL_STORAGE_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
      }
      sessionStorage.setItem(STORAGE_OWNER_USER_KEY, current);
    } catch {
      try {
        USER_SCOPED_SESSION_STORAGE_KEYS.forEach(k => sessionStorage.removeItem(k));
        USER_SCOPED_LOCAL_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
  }, [isLoaded, userId]);

  if (!isLoaded || !isSignedIn) return null;

  // has() reads the JWT pla claim — pass the slug, not the plan ID (see lib/plans.ts).
  // publicMetadata.proGrantedAt is a real-time fallback for the brief window after
  // checkout where the JWT hasn't refreshed yet.
  const rawGrantedAt = user?.publicMetadata?.proGrantedAt;
  const grantedAtTs = typeof rawGrantedAt === 'number'
    ? rawGrantedAt
    : (typeof rawGrantedAt === 'string' ? Number(rawGrantedAt) : NaN);
  const hasFreshProFallback = Number.isFinite(grantedAtTs) && (Date.now() - grantedAtTs < 5 * 60 * 1000);
  const isPro = has({ plan: PRO_PLAN_SLUG }) || hasFreshProFallback;

  return (
    <div className="flex items-center gap-3">
      {isPro ? (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-600/20 to-cyan-600/20 border border-purple-500/30 text-purple-300 select-none">
          Pro
        </span>
      ) : (
        <Link
          href="/pricing"
          onClick={() => track('pricing_upgrade_clicked', { source: 'nav' })}
          className="text-xs font-medium text-gray-400 hover:text-white transition-colors whitespace-nowrap"
        >
          Upgrade to Pro
        </Link>
      )}
      <UserButton />
    </div>
  );
}
