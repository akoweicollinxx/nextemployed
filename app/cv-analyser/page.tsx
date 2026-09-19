'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { AnalysisForm } from '@/components/analysis/AnalysisForm';
import { AnalysisResult } from '@/components/analysis/AnalysisResult';
import { LoadingState } from '@/components/analysis/LoadingState';
import { track } from '@/lib/track';

type Status = 'idle' | 'streaming' | 'done' | 'error' | 'rate-limited';

export default function CVAnalyserPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-up?redirect_url=/cv-analyser');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (status === 'streaming') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status]);

  const handleSubmit = async (cvText: string, jobDescription: string) => {
    setStatus('streaming');
    setResult('');
    setError(null);

    let response: Response;
    try {
      response = await fetch('/api/try/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText, jobDescription }),
      });
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
      return;
    }

    if (response.status === 429) {
      setStatus('rate-limited');
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

    // Store server-side so /try/tailored-cv can read it via the cookie.
    fetch('/api/try/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText, jobDescription, teaserResult: '', submittedAt: Date.now() }),
    }).catch(() => {});

    setStatus('done');
  };

  const handleReset = useCallback(() => {
    setStatus('idle');
    setResult('');
    setError(null);
    setResetKey((k) => k + 1);
  }, []);

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent mb-2">
            Analyse your CV
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Paste a job description and your CV. We'll find what's hiding your strengths and rewrite the weakest sections.
          </p>
        </div>

        {/* Rate-limited */}
        {status === 'rate-limited' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center space-y-3">
            <p className="text-yellow-300 font-semibold">
              You've used your 5 analyses for today — come back tomorrow.
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-6 py-2 rounded-full border border-white/10 bg-white/5 text-sm font-medium hover:bg-white/10 transition-all"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3 mb-6">
            <span className="text-red-400 text-lg shrink-0">⚠</span>
            <div>
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={handleReset}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Form — shown when idle or after error (resetKey forces remount to clear fields) */}
        {(status === 'idle' || status === 'error') && (
          <AnalysisForm
            key={resetKey}
            onSubmit={handleSubmit}
            isLoading={false}
          />
        )}

        {/* Spinner before first chunk arrives */}
        {status === 'streaming' && !result && (
          <LoadingState message="Analysing your CV..." />
        )}

        {/* Streaming / done result */}
        {result && (
          <div ref={resultRef}>
            <AnalysisResult
              result={result}
              isStreaming={status === 'streaming'}
              ctas={[
                { label: 'Generate tailored CV', onClick: () => { track('tailored_cv_cta_clicked'); router.push('/try/tailored-cv'); }, variant: 'primary' },
                { label: 'Practice with the interviewer', href: '/interview', variant: 'secondary' },
                { label: 'Run another analysis', onClick: handleReset, variant: 'secondary' },
              ]}
            />
          </div>
        )}
      </div>
    </main>
  );
}
