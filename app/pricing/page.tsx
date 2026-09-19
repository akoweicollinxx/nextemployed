'use client';

import { useEffect, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { track } from '@/lib/track';
import { PRO_PLAN_SLUG } from '@/lib/plans';

const FREE_FEATURES = [
  'CV analysis and rewrites',
  'Tailored CV generation',
  'PDF downloads',
  '1 mock interview per week',
];

const PRO_FEATURES = [
  'Everything in Free',
  { text: 'Unlimited mock interviews', bold: true },
  'Practice with different roles daily',
  'Priority Vapi routing',
];

const FAQS = [
  {
    q: 'Why is CV analysis free?',
    a: "Because everyone deserves a strong CV. We charge for interview practice because that's what serious job seekers need most.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your account settings. Your subscription runs until the end of the paid period.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'The free tier IS the trial. Try everything, then upgrade if unlimited interview practice would help.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your CVs and history stay. You just go back to 1 interview per week.',
  },
];

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export default function PricingPage() {
  const { isSignedIn, isLoaded, has } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const planId = process.env.NEXT_PUBLIC_CLERK_PRO_PLAN_ID ?? '';
  // has() reads the JWT pla claim — pass the slug, not the ID (see lib/plans.ts).
  const isPro = isLoaded && isSignedIn
    ? has({ plan: PRO_PLAN_SLUG })
    : false;

  useEffect(() => {
    track('pricing_page_viewed', { is_signed_in: isSignedIn ?? false, is_pro: isPro });
  }, [isSignedIn, isPro]);

  function handleUpgrade() {
    if (!planId) {
      console.error('[Billing] NEXT_PUBLIC_CLERK_PRO_PLAN_ID is not set.');
      return;
    }
    track('pricing_upgrade_clicked', { source: 'pricing_page_pro_card' });
    track('pricing_checkout_started', { plan_id: planId });
    // __internal_openCheckout opens Clerk's checkout drawer synchronously.
    // onSubscriptionComplete fires when Stripe confirms the payment.
    clerk.__internal_openCheckout({
      planId,
      planPeriod: 'month',
      onSubscriptionComplete: async () => {
        track('pricing_checkout_completed', { plan_id: planId });
        try {
          // Rely on the verified Clerk webhook to grant entitlement, then refresh.
          for (let i = 0; i < 6; i++) {
            await user?.reload();
            const grantedAt = user?.publicMetadata?.proGrantedAt;
            if (typeof grantedAt === 'number') break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          await clerk.session?.touch();
        } catch (err) {
          console.error('[Billing] Failed to refresh user after checkout:', err);
        }
      },
    });
  }

  return (
    <main className="min-h-screen bg-black text-white relative overflow-x-hidden">

      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950/40 to-black" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(147,51,234,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.4)_1px,transparent_1px)] bg-[size:100px_100px]" />
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-cyan-600/8 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20">

        {/* Hero */}
        <div className="text-center mb-16">
          <Link href="/" className="inline-flex items-center gap-2 mb-10 group">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full" />
            </div>
            <span className="text-base font-semibold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              NextEmployed
            </span>
          </Link>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
            Simple pricing
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
            NextEmployed is free forever for CV help. Unlimited mock interviews for the price of a lunch.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">

          {/* Free card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-3">Free</p>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="text-5xl font-bold">$0</span>
                <span className="text-gray-500 mb-2">/month</span>
              </div>
              <p className="text-gray-400 text-sm mt-3 leading-relaxed">
                Everything you need to write a strong CV.
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            {!isLoaded ? null : !isSignedIn ? (
              <Link
                href="/sign-up"
                onClick={() => track('pricing_upgrade_clicked', { source: 'pricing_page_free_card' })}
                className="w-full py-3 rounded-full border border-white/20 text-center text-sm font-semibold text-white hover:bg-white/5 transition-colors"
              >
                Get started
              </Link>
            ) : isPro ? (
              <div className="w-full py-3 rounded-full border border-white/10 text-center text-sm text-gray-600 cursor-default select-none">
                Previous plan
              </div>
            ) : (
              <div className="w-full py-3 rounded-full border border-white/10 text-center text-sm text-gray-500 cursor-default select-none">
                Your current plan
              </div>
            )}
          </div>

          {/* Pro card — gradient border */}
          <div className="rounded-3xl p-px bg-gradient-to-br from-purple-500/60 via-cyan-500/40 to-purple-500/60">
            <div className="rounded-[23px] bg-gray-950 p-8 h-full flex flex-col">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-medium text-purple-400 uppercase tracking-widest">Pro</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 text-purple-300 uppercase tracking-widest">
                    Popular
                  </span>
                </div>
                <div className="flex items-end gap-1.5 mb-1">
                  <span className="text-5xl font-bold bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">$9.99</span>
                  <span className="text-gray-500 mb-2">/month</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Cancel anytime</p>
                <p className="text-xs text-gray-700 mt-1">Billed in USD. Your bank may apply currency conversion.</p>
                <p className="text-gray-400 text-sm mt-3 leading-relaxed">
                  Practice as much as you want.
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {PRO_FEATURES.map((f, i) => {
                  const text = typeof f === 'string' ? f : f.text;
                  const bold = typeof f !== 'string' && f.bold;
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <CheckIcon />
                      {bold ? <strong className="text-white font-semibold">{text}</strong> : text}
                    </li>
                  );
                })}
              </ul>

              {!isLoaded ? null : isPro ? (
                <div className="w-full py-3 rounded-full border border-purple-500/30 text-center text-sm font-semibold text-purple-400 cursor-default select-none">
                  You&apos;re on Pro ✓
                </div>
              ) : !isSignedIn ? (
                <Link
                  href="/sign-up?redirect_url=/pricing"
                  onClick={() => track('pricing_upgrade_clicked', { source: 'pricing_page_pro_card' })}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-center text-sm font-bold text-white hover:shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Sign up to upgrade
                </Link>
              ) : (
                <button
                  onClick={handleUpgrade}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-bold text-white hover:shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Common questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-medium text-white hover:bg-white/[0.03] transition-colors"
                >
                  {faq.q}
                  <svg
                    className={`w-4 h-4 text-gray-500 shrink-0 ml-4 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {faqOpen === i && (
                  <p className="px-6 pb-5 text-sm text-gray-400 leading-relaxed border-t border-white/5 pt-3">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer nudge */}
        <p className="text-center text-gray-700 text-sm mt-16">
          Questions?{' '}
          <a href="mailto:akoweicollins17@gmail.com" className="text-gray-500 hover:text-gray-400 underline transition-colors">
            Get in touch
          </a>
        </p>

      </div>
    </main>
  );
}
