'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { track } from '@/lib/track';

const LOADING_MESSAGES = [
  'Reading the job description...',
  'Scanning your CV for matches...',
  'Identifying the biggest gap...',
  'Writing your feedback...',
];

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

type Particle = { id: number; left: number; top: number; delay: number; duration: number };

export default function TryPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [cvText, setCvText] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvMode, setCvMode] = useState<'text' | 'file'>('text');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isClient, setIsClient] = useState(false);
  const startTimeRef = useRef<number>(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
    setParticles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 3 + Math.random() * 2,
      }))
    );
    track('try_page_viewed');
  }, []);

  // Cycle loading messages
  useEffect(() => {
    if (status !== 'loading') return;
    const interval = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      1500
    );
    return () => clearInterval(interval);
  }, [status]);

  // Scroll result into view when streaming starts
  useEffect(() => {
    if (status === 'streaming') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status]);

  const jdLength = jobDescription.trim().length;
  const cvReady = cvMode === 'text' ? cvText.trim().length >= 50 : cvFile !== null;
  const canSubmit = jdLength >= 100 && cvReady && status === 'idle';

  const handleSubmit = async () => {
    setStatus('loading');
    setResult('');
    setError('');
    setLoadingMsgIdx(0);
    startTimeRef.current = Date.now();

    track('try_submission_started', {
      jd_length: jdLength,
      cv_length: cvMode === 'text' ? cvText.trim().length : cvFile?.size ?? 0,
    });

    const formData = new FormData();
    formData.append('jobDescription', jobDescription.trim());
    if (cvMode === 'text') {
      formData.append('cvText', cvText.trim());
    } else if (cvFile) {
      formData.append('cvFile', cvFile);
    }

    let response: Response;
    try {
      response = await fetch('/api/try', { method: 'POST', body: formData });
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
      track('try_submission_failed', { error_type: 'network' });
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Please try again.');
      setStatus('error');
      track('try_submission_failed', { error_type: `http_${response.status}` });
      return;
    }

    let resolvedCvText = cvMode === 'text' ? cvText.trim() : '';
    const storedJobDescription = jobDescription.trim();

    // For file uploads the server extracts the CV text. Recover it from the
    // response header so we can persist it for the /try/results full-analysis flow.
    if (cvMode === 'file') {
      try {
        const headerVal = response.headers.get('x-cv-text');
        if (headerVal) resolvedCvText = decodeURIComponent(headerVal);
      } catch {
        // header absent or malformed — resolvedCvText stays ''
      }
    }

    if (!response.body) {
      setError('Invalid stream response from the server.');
      setStatus('error');
      track('try_submission_failed', { error_type: 'no_body' });
      return;
    }

    setStatus('streaming');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamedResult = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamedResult += chunk;
        setResult((prev) => prev + chunk);
      }
    } catch {
      // Stream interrupted — show what arrived so far
    }

    // Store the submission server-side via Redis + httpOnly cookie so it survives
    // Clerk's sign-up flow (Clerk wipes localStorage on mount during signup).
    fetch('/api/try/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvText: resolvedCvText,
        jobDescription: storedJobDescription,
        teaserResult: streamedResult,
        submittedAt: Date.now(),
      }),
    })
      .then(r => { if (r.ok) track('try_submission_persisted'); })
      .catch(() => {});

    setStatus('done');
    track('try_submission_completed', { duration_ms: Date.now() - startTimeRef.current });
  };

  const reset = () => {
    setStatus('idle');
    setResult('');
    setError('');
  };

  return (
    <main className="min-h-screen relative overflow-hidden text-white">

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-900 to-black">
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(147,51,234,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.3)_1px,transparent_1px)] bg-[size:100px_100px] animate-pulse" />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-3xl opacity-20 animate-pulse" />
      </div>

      {isClient && (
        <div className="absolute inset-0 pointer-events-none">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping"
              style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
            />
          ))}
        </div>
      )}

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
            <div className="w-5 h-5 bg-white rounded-full animate-pulse" />
          </div>
          <span className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            NextEmployed
          </span>
        </Link>
        <div className="flex gap-2 sm:gap-4">
          <Link
            href="/sign-in"
            className="px-3 py-1.5 sm:px-5 sm:py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs sm:text-sm font-medium hover:bg-white/10 transition-all whitespace-nowrap"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-3 py-1.5 sm:px-5 sm:py-2 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white text-xs sm:text-sm font-medium hover:shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-all whitespace-nowrap"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pb-24 pt-6">

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-medium text-purple-400 mb-5">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
            </span>
            Free — no sign up required
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
            See your biggest CV mistake{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
              in 30 seconds
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Paste a job description and your CV. Our AI finds the single biggest reason you&apos;re not getting called back — and rewrites it.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-gradient-to-br from-black/80 via-purple-900/50 to-black/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left — Job Description */}
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-semibold text-purple-300">
                Job Description
                <span className="ml-2 text-xs text-gray-500 font-normal">min 100 chars</span>
              </label>
              <textarea
                className="flex-1 min-h-[260px] p-4 bg-black/40 border border-purple-500/30 rounded-2xl text-white placeholder-gray-600 text-sm leading-relaxed focus:outline-none focus:border-purple-400 transition-colors resize-none"
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value.slice(0, 8000))}
                disabled={status !== 'idle'}
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span className={jdLength < 100 && jdLength > 0 ? 'text-orange-400' : ''}>
                  {jdLength < 100 && jdLength > 0 ? `${100 - jdLength} more chars needed` : ''}
                </span>
                <span>{jdLength.toLocaleString()} / 8,000</span>
              </div>
            </div>

            {/* Right — CV */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-purple-300">Your CV</label>
                <div className="flex rounded-full overflow-hidden border border-purple-500/30 text-xs">
                  <button
                    onClick={() => setCvMode('text')}
                    className={`px-3 py-1 transition-colors ${cvMode === 'text' ? 'bg-purple-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
                    disabled={status !== 'idle'}
                  >
                    Paste text
                  </button>
                  <button
                    onClick={() => setCvMode('file')}
                    className={`px-3 py-1 transition-colors ${cvMode === 'file' ? 'bg-purple-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
                    disabled={status !== 'idle'}
                  >
                    Upload file
                  </button>
                </div>
              </div>

              {cvMode === 'text' ? (
                <>
                  <textarea
                    className="flex-1 min-h-[260px] p-4 bg-black/40 border border-purple-500/30 rounded-2xl text-white placeholder-gray-600 text-sm leading-relaxed focus:outline-none focus:border-purple-400 transition-colors resize-none"
                    placeholder="Paste your CV text here..."
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value.slice(0, 8000))}
                    disabled={status !== 'idle'}
                  />
                  <div className="flex justify-end text-xs text-gray-600">
                    <span>{cvText.length.toLocaleString()} / 8,000</span>
                  </div>
                </>
              ) : (
                <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center border-2 border-dashed border-purple-500/30 rounded-2xl p-6 bg-black/20">
                  <div className="text-4xl mb-3 opacity-40">📄</div>
                  <p className="text-sm text-gray-400 mb-4 text-center">
                    PDF, DOCX, or TXT — text will be extracted server-side
                  </p>
                  <label className="cursor-pointer px-5 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm hover:bg-purple-500/30 transition-colors">
                    {cvFile ? cvFile.name : 'Choose file'}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      disabled={status !== 'idle'}
                      onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {cvFile && (
                    <button
                      onClick={() => setCvFile(null)}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-10 py-3.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold text-base shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              Get my free feedback
            </button>
          </div>
        </div>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="flex items-center gap-3 justify-center py-6">
            <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-purple-300 text-sm font-medium transition-all duration-300">
              {LOADING_MESSAGES[loadingMsgIdx]}
            </span>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3">
            <span className="text-red-400 text-lg shrink-0">⚠</span>
            <div>
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={reset}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {(status === 'streaming' || status === 'done') && result && (
          <div ref={resultRef} className="space-y-4">
            <div className="bg-gradient-to-br from-black/80 via-purple-900/50 to-black/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    Your free insight
                  </h2>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-200 leading-relaxed">
                  {result}
                  {status === 'streaming' && (
                    <span className="inline-block w-0.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              </div>
            </div>

            {/* Soft wall — shown after stream completes */}
            {status === 'done' && (
              <div className="relative rounded-3xl overflow-hidden">
                {/* Blurred fake content */}
                <div className="blur-sm select-none pointer-events-none p-6 sm:p-8 bg-gradient-to-br from-black/80 via-purple-900/50 to-black/80 border border-purple-500/30 rounded-3xl space-y-3">
                  {[80, 100, 65, 90, 55, 75, 40].map((w, i) => (
                    <div key={i} className="h-3 bg-white/15 rounded-full" style={{ width: `${w}%` }} />
                  ))}
                </div>

                {/* Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-3xl p-6 sm:p-10 text-center">
                  <div className="text-3xl mb-3">🔍</div>
                  <h3 className="text-2xl font-black text-white mb-2">6 more issues found</h3>
                  <p className="text-gray-400 text-sm max-w-sm mb-6 leading-relaxed">
                    Sign up free to see every issue, get a full CV rewrite tailored to this specific job, and generate interview questions.
                  </p>
                  <Link
                    href="/sign-up?redirect_url=%2Ftry%2Fresults"
                    onClick={() => track('try_signup_clicked')}
                    className="px-8 py-3.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold text-base shadow-lg transform hover:scale-105 transition-all duration-300"
                  >
                    Get your full analysis free →
                  </Link>
                  <button
                    onClick={reset}
                    className="mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Try a different CV or job
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}