'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { track } from '@/lib/track';
import { AnalysisResult } from '@/components/analysis/AnalysisResult';
import { LoadingState } from '@/components/analysis/LoadingState';
type Submission = {
  cvText: string;
  jobDescription: string;
  teaserResult: string;
  submittedAt: number;
};

type Status = 'loading' | 'streaming' | 'done' | 'error' | 'orphaned';

export default function TryResultsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [result, setResult] = useState('');
  const [teaserResult, setTeaserResult] = useState('');
  const [error, setError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in?redirect_url=%2Ftry%2Fresults');
      return;
    }

    if (hasStarted.current) return;
    hasStarted.current = true;

    // Submission is stored server-side in Redis; the cookie carries the ID.
    // Fetch it from the read endpoint (requires Clerk auth, which we have at this point).
    void (async () => {
    let submission: Submission | null = null;
    try {
      const res = await fetch('/api/try/read-submission');
      if (res.status === 404) {
        setStatus('orphaned');
        track('try_results_orphaned');
        return;
      }
      if (!res.ok) {
        setError('Something went wrong loading your analysis. Please try again.');
        setStatus('error');
        return;
      }
      submission = await res.json() as Submission;
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
      return;
    }

    if (!submission?.cvText || !submission?.jobDescription) {
      setStatus('orphaned');
      track('try_results_orphaned');
      return;
    }

    setTeaserResult(submission.teaserResult ?? '');
    track('try_results_page_viewed');
    runFullAnalysis(submission);
    })();
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (status === 'streaming') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status]);

  async function runFullAnalysis(submission: Submission) {
    setStatus('streaming');

    let response: Response;
    try {
      response = await fetch('/api/try/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText: submission.cvText,
          jobDescription: submission.jobDescription,
        }),
      });
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Please try again.');
      setStatus('error');
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResult((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      // Stream interrupted — show what arrived
    }

    setStatus('done');
    // Submission stays in Redis — /try/tailored-cv is the next consumer and
    // calls /api/try/consume-submission to delete it after rendering.
    track('try_results_completed');
  }

  if (!isLoaded) {
    return (
      <main className="flex items-center justify-center h-screen bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-900 to-black">
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(147,51,234,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.3)_1px,transparent_1px)] bg-[size:100px_100px] animate-pulse" />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-3xl opacity-20 animate-pulse" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
            <div className="w-5 h-5 bg-white rounded-full animate-pulse" />
          </div>
          <span className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            NextEmployed
          </span>
        </Link>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm font-medium hover:bg-white/10 transition-all"
        >
          Go to Dashboard →
        </Link>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pb-24 pt-4">

        {/* Orphaned state */}
        {status === 'orphaned' && (
          <div className="text-center py-24 space-y-6">
            <div className="text-5xl">🔍</div>
            <h1 className="text-2xl font-black text-white">No submission found</h1>
            <p className="text-gray-400 max-w-sm mx-auto leading-relaxed">
              Your free analysis has expired or was cleared. Submissions are kept for 1 hour.
              Head back to /try to run a new one — it only takes 30 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/try"
                className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold hover:from-purple-600 hover:to-cyan-600 transition-all"
              >
                Run a new free analysis
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-3 rounded-full border border-white/10 bg-white/5 text-white font-medium hover:bg-white/10 transition-all"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Loading / streaming */}
        {(status === 'loading' || status === 'streaming') && !result && (
          <LoadingState
            message={status === 'loading' ? 'Preparing your full analysis...' : 'Analysing all 7 issues...'}
          />
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3 mt-6">
            <span className="text-red-400 text-lg shrink-0">⚠</span>
            <div>
              <p className="text-red-300 text-sm">{error}</p>
              <Link
                href="/try"
                className="mt-2 inline-block text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
              >
                Start a new analysis
              </Link>
            </div>
          </div>
        )}

        {/* Teaser + full result + CTAs */}
        {(status === 'streaming' || status === 'done') && (teaserResult || result) && (
          <div ref={resultRef}>
            <AnalysisResult
              result={result}
              isStreaming={status === 'streaming'}
              teaserResult={teaserResult || undefined}
              ctas={[
                { label: 'Generate tailored CV', onClick: () => { track('tailored_cv_cta_clicked'); router.push('/try/tailored-cv'); }, variant: 'primary' },
                { label: 'Practice with the interviewer', href: '/interview', variant: 'secondary' },
                { label: 'Run another analysis', href: '/try', variant: 'secondary' },
              ]}
            />
          </div>
        )}
      </div>
    </main>
  );
}