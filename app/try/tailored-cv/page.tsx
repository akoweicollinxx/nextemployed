'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { track } from '@/lib/track';
import type { TailoredCvData } from '@/components/pdf/TailoredCvDocument';
import { TAILORED_CV_MONTHLY_LIMIT } from '@/lib/rate-limit';

const PdfDownloader = dynamic(() => import('@/components/pdf/PdfDownloader'), {
  ssr: false,
  loading: () => (
    <button
      disabled
      className="px-8 py-3.5 rounded-full bg-white/10 text-white font-bold text-sm opacity-60 cursor-not-allowed"
    >
      Preparing PDF...
    </button>
  ),
});


const LOADING_MESSAGES = [
  'Reading your CV...',
  'Studying the job description...',
  'Reordering for relevance...',
  'Tailoring the language...',
];

type Status = 'orphaned' | 'generating' | 'ready' | 'error' | 'limit_hit' | 'too_sparse';

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 40);
}

function buildFilename(data: TailoredCvData): string {
  const name = (data.contact?.name ?? '').trim();
  const parts = name.split(/\s+/);
  const first = sanitizeFilename(parts[0] ?? 'CV');
  const last = sanitizeFilename(parts.slice(1).join('_'));
  const role = sanitizeFilename(data.job_title || data.company || 'tailored');
  const namePart = last ? `${first}_${last}` : first;
  return `${namePart}_CV_${role}.pdf`;
}

export default function TailoredCvPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const [status, setStatus] = useState<Status>('generating');
  const [editedData, setEditedData] = useState<TailoredCvData | null>(null);
  const [originalCvText, setOriginalCvText] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number>(TAILORED_CV_MONTHLY_LIMIT);
  const [resetDate, setResetDate] = useState('');
  const [limitResetDate, setLimitResetDate] = useState('');
  const [activeTab, setActiveTab] = useState<'original' | 'tailored'>('tailored');
  const [isEditing, setIsEditing] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [editBullets, setEditBullets] = useState<string[][]>([]);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in?redirect_url=%2Ftry%2Ftailored-cv');
      return;
    }
    if (hasStarted.current) return;
    hasStarted.current = true;
    loadAndGenerate();
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== 'generating') return;
    const interval = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      2200
    );
    return () => clearInterval(interval);
  }, [status]);

  const loadAndGenerate = useCallback(async () => {
    // Submission is stored in Redis; read via the server endpoint then consume
    // (this is the last consumer — consume deletes from Redis and clears the cookie).
    let submission: { cvText: string; jobDescription: string } | null = null;
    try {
      const res = await fetch('/api/try/read-submission');
      if (!res.ok) {
        setStatus('orphaned');
        return;
      }
      submission = await res.json();
    } catch {
      setStatus('orphaned');
      return;
    }

    if (!submission?.cvText || !submission?.jobDescription) {
      setStatus('orphaned');
      return;
    }

    setOriginalCvText(submission.cvText);

    let response: Response;
    try {
      response = await fetch('/api/tailored-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText: submission.cvText,
          jdText: submission.jobDescription,
        }),
      });
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
      return;
    }

    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      setLimitResetDate(data.resetDate ?? '');
      setStatus('limit_hit');
      return;
    }

    if (response.status === 422) {
      setStatus('too_sparse');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Please try again.');
      setStatus('error');
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      setError('Could not decode the response from the server.');
      setStatus('error');
      return;
    }

    const data = (body as { data?: TailoredCvData; remaining?: number; resetDate?: string }).data;
    if (!data) {
      setError('The tailored CV response was incomplete. Please try again.');
      setStatus('error');
      return;
    }

    setEditedData(structuredClone(data));
    setRemaining((body as { remaining?: number }).remaining ?? 0);
    setResetDate((body as { resetDate?: string }).resetDate ?? '');

    // Seed the edit form fields
    setEditSummary(data.summary ?? '');
    setEditBullets((data.experience ?? []).map((j) => [...(j.bullets ?? [])]));

    // Last consumer — delete from Redis and clear the cookie.
    fetch('/api/try/consume-submission', { method: 'POST' }).catch(() => {});
    setStatus('ready');
  }, []);

  function applyEdits() {
    if (!editedData) return;
    const updated: TailoredCvData = {
      ...editedData,
      summary: editSummary,
      experience: editedData.experience.map((job, i) => ({
        ...job,
        bullets: editBullets[i] ?? job.bullets,
      })),
    };
    setEditedData(updated);
    setIsEditing(false);
  }

  const used = TAILORED_CV_MONTHLY_LIMIT - remaining;

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
          Dashboard →
        </Link>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-24 pt-2">

        {/* ── Orphaned ── */}
        {status === 'orphaned' && (
          <div className="text-center py-24 space-y-6">
            <div className="text-5xl">📄</div>
            <h1 className="text-2xl font-black">No CV submission found</h1>
            <p className="text-gray-400 max-w-sm mx-auto leading-relaxed">
              Your submission has expired or was not found. Paste your CV on /try to get started — it only takes 30 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/try"
                className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold hover:from-purple-600 hover:to-cyan-600 transition-all"
              >
                Start a new analysis
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-3 rounded-full border border-white/10 bg-white/5 font-medium hover:bg-white/10 transition-all"
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* ── Generating ── */}
        {status === 'generating' && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-purple-300 text-base font-medium transition-all duration-300">
              {LOADING_MESSAGES[loadingMsgIdx]}
            </p>
            <p className="text-gray-600 text-xs">This takes about 20-30 seconds</p>
          </div>
        )}

        {/* ── Limit hit ── */}
        {status === 'limit_hit' && (
          <div className="text-center py-24 space-y-5">
            <div className="text-5xl">🔒</div>
            <h1 className="text-2xl font-black">Monthly limit reached</h1>
            <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
              You&apos;ve used your {TAILORED_CV_MONTHLY_LIMIT} free tailored CVs this month. Paid tier coming soon.
              {limitResetDate && ` Your limit resets on ${limitResetDate}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/try/results"
                className="px-8 py-3 rounded-full border border-white/10 bg-white/5 font-medium hover:bg-white/10 transition-all"
              >
                ← Back to your analysis
              </Link>
              <Link
                href="/interview"
                className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold hover:from-purple-600 hover:to-cyan-600 transition-all"
              >
                Practice interviews instead
              </Link>
            </div>
          </div>
        )}

        {/* ── Too sparse ── */}
        {status === 'too_sparse' && (
          <div className="text-center py-24 space-y-5">
            <div className="text-5xl">✏️</div>
            <h1 className="text-2xl font-black">CV is too sparse to tailor</h1>
            <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
              Your CV doesn&apos;t have enough content for us to work with. Add more detail about your experience, then try again.
            </p>
            <Link
              href="/try"
              className="inline-block px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold hover:from-purple-600 hover:to-cyan-600 transition-all"
            >
              Try again with more detail
            </Link>
          </div>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <div className="py-12">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3 max-w-xl mx-auto">
              <span className="text-red-400 text-lg shrink-0">⚠</span>
              <div>
                <p className="text-red-300 text-sm">{error}</p>
                <button
                  onClick={() => { hasStarted.current = false; setStatus('generating'); loadAndGenerate(); }}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Ready ── */}
        {status === 'ready' && editedData && (
          <div className="space-y-6">

            {/* Header bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs text-purple-400 uppercase tracking-wider font-semibold mb-1">Tailored for</p>
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  {editedData.job_title || 'This Role'}
                  {editedData.company ? (
                    <span className="text-gray-400 font-normal"> at {editedData.company}</span>
                  ) : null}
                </h1>
              </div>
              <PdfDownloader
                data={editedData}
                filename={buildFilename(editedData)}
                onDownload={() => track('tailored_cv_pdf_downloaded')}
              />
            </div>

            {/* Usage indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex gap-1">
                {Array.from({ length: TAILORED_CV_MONTHLY_LIMIT }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${i < used ? 'bg-purple-500' : 'bg-white/10'}`}
                  />
                ))}
              </div>
              <span>
                {used} of {TAILORED_CV_MONTHLY_LIMIT} free tailored CVs used this month
                {resetDate ? ` · resets ${resetDate}` : ''}
              </span>
            </div>

            {/* Flagged gaps */}
            {editedData.flagged_gaps?.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
                <p className="text-amber-400 text-sm font-semibold mb-2">
                  Heads up — gaps we did NOT fill in
                </p>
                <p className="text-gray-400 text-xs mb-3">
                  The JD mentions these things that aren&apos;t clearly in your CV. We did NOT add them. Consider whether you can honestly speak to them:
                </p>
                <ul className="space-y-1">
                  {editedData.flagged_gaps.map((gap, i) => (
                    <li key={i} className="text-amber-300 text-sm flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mobile tabs */}
            <div className="flex lg:hidden rounded-full overflow-hidden border border-purple-500/30 text-sm w-fit">
              <button
                onClick={() => setActiveTab('original')}
                className={`px-4 py-2 transition-colors ${activeTab === 'original' ? 'bg-purple-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
              >
                Original CV
              </button>
              <button
                onClick={() => setActiveTab('tailored')}
                className={`px-4 py-2 transition-colors ${activeTab === 'tailored' ? 'bg-purple-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
              >
                Tailored CV
              </button>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left — Original */}
              <div className={`${activeTab === 'original' ? 'block' : 'hidden lg:block'} flex flex-col`}>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Original CV</p>
                <div className="bg-black/40 border border-white/10 rounded-2xl p-5 h-[600px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-gray-400 leading-relaxed">
                    {originalCvText || 'Original text not available.'}
                  </pre>
                </div>
              </div>

              {/* Right — Tailored preview */}
              <div className={`${activeTab === 'tailored' ? 'block' : 'hidden lg:block'} flex flex-col`}>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Tailored CV</p>
                <div className="bg-white rounded-2xl p-6 h-[600px] overflow-y-auto text-black">
                  <TailoredCvPreview data={editedData} />
                </div>
              </div>
            </div>

            {/* Edit mode toggle */}
            {!isEditing ? (
              <div className="flex justify-center">
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline"
                >
                  Not quite right? Edit and re-download
                </button>
              </div>
            ) : (
              <EditForm
                summary={editSummary}
                onSummaryChange={setEditSummary}
                bullets={editBullets}
                experience={editedData.experience}
                onBulletsChange={setEditBullets}
                onSave={applyEdits}
                onCancel={() => setIsEditing(false)}
              />
            )}

            {/* Footer CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 border-t border-white/5">
              <Link
                href="/interview"
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold text-sm hover:from-purple-600 hover:to-cyan-600 transition-all text-center"
              >
                Practice interviews →
              </Link>
              <Link
                href="/try"
                className="px-6 py-2.5 rounded-full border border-white/10 bg-white/5 text-white font-medium text-sm hover:bg-white/10 transition-all text-center"
              >
                Analyse another CV
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function clean(val: string | null | undefined): string {
  if (!val) return '';
  const t = val.trim();
  if (/^(n\/a|none|-|–|—|null|undefined)$/i.test(t)) return '';
  return t;
}

function normalizeSkillsForPreview(
  skills: TailoredCvData['skills']
): Array<{ category: string; items: string[] }> {
  if (!skills) return [];
  if (Array.isArray(skills)) {
    const cleaned = skills.map(clean).filter(Boolean);
    return cleaned.length ? [{ category: '', items: cleaned }] : [];
  }
  return (skills.categorised ?? []).filter((cat) =>
    (cat.items ?? []).some((item) => clean(item))
  );
}

function normalizeLinksForPreview(
  links: Array<{ label: string; url: string } | string>
): Array<{ label: string; url: string }> {
  return (links ?? [])
    .map((link) => {
      if (typeof link === 'string') {
        const t = clean(link);
        if (!t) return null;
        const isUrl = /^https?:\/\//i.test(t) || t.startsWith('www.');
        return { label: t, url: isUrl ? t : '' };
      }
      const label = clean(link.label) || clean(link.url);
      const url = clean(link.url);
      return label ? { label, url } : null;
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

const PREVIEW_NAVY = '#1a2a4a';

function TailoredCvPreview({ data }: { data: TailoredCvData }) {
  const { contact, summary, experience, education, key_achievements } = data;

  const candidateName = clean(contact?.name);
  const contactTitle = clean(contact?.title);
  const cleanedSummary = clean(summary);
  const categorisedSkills = normalizeSkillsForPreview(data.skills);
  const normalizedLinks = normalizeLinksForPreview(contact?.links ?? []);
  const cleanedAchievements = (key_achievements ?? []).map(clean).filter(Boolean);

  const contactItems: Array<{ text: string; url?: string }> = [];
  if (clean(contact?.email)) {
    contactItems.push({ text: clean(contact.email), url: `mailto:${clean(contact.email)}` });
  }
  if (clean(contact?.phone)) contactItems.push({ text: clean(contact.phone) });
  if (clean(contact?.location)) contactItems.push({ text: clean(contact.location) });
  for (const link of normalizedLinks) {
    contactItems.push({ text: link.label, url: link.url || undefined });
  }

  return (
    <div className="font-sans text-[10px] leading-[1.45] text-black">

      {/* Name */}
      {candidateName && (
        <p className="text-[22px] font-bold text-center mb-[2px] leading-tight"
           style={{ color: PREVIEW_NAVY }}>
          {candidateName}
        </p>
      )}

      {/* Contact title */}
      {contactTitle && (
        <p className="text-[10px] text-center mb-[4px] text-[#4a5568]">{contactTitle}</p>
      )}

      {/* Contact bar */}
      {contactItems.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-1 mb-2">
          {contactItems.map((item, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <span className="text-[#aaaaaa] mx-1">|</span>}
              {item.url ? (
                <a href={item.url} className="text-[9px] no-underline" style={{ color: PREVIEW_NAVY }}>
                  {item.text}
                </a>
              ) : (
                <span className="text-[9px] text-[#333333]">{item.text}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <hr className="border-t mb-3 mt-1" style={{ borderColor: PREVIEW_NAVY }} />

      {/* Summary */}
      {cleanedSummary && (
        <div className="mb-3">
          <p className="text-[11px] font-bold pb-0.5 mb-1.5 border-b"
             style={{ color: PREVIEW_NAVY, borderColor: PREVIEW_NAVY }}>
            PROFESSIONAL SUMMARY
          </p>
          <p className="text-black leading-[1.5]">{cleanedSummary}</p>
        </div>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-bold pb-0.5 mb-2 border-b"
             style={{ color: PREVIEW_NAVY, borderColor: PREVIEW_NAVY }}>
            EXPERIENCE
          </p>
          {experience.map((job, i) => {
            const title = clean(job.title);
            const employer = clean(job.employer);
            const dates = clean(job.dates);
            const location = clean(job.location);
            const bullets = (job.bullets ?? []).map(clean).filter(Boolean);
            const employerLine = [employer, location].filter(Boolean).join('  ·  ');
            if (!title && !employer) return null;
            return (
              <div key={i} className="mb-3">
                <div className="flex justify-between items-start gap-2">
                  {title && <p className="font-bold text-black">{title}</p>}
                  {dates && <p className="text-[9px] text-[#555555] shrink-0">{dates}</p>}
                </div>
                {employerLine && (
                  <p className="text-[9px] italic text-[#444444] mb-1">{employerLine}</p>
                )}
                <ul className="space-y-[3px] mt-1">
                  {bullets.map((b, j) => (
                    <li key={j} className="flex gap-1.5 text-black">
                      <span className="shrink-0 mt-px" style={{ color: PREVIEW_NAVY }}>•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Key Achievements */}
      {cleanedAchievements.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-bold pb-0.5 mb-2 border-b"
             style={{ color: PREVIEW_NAVY, borderColor: PREVIEW_NAVY }}>
            KEY ACHIEVEMENTS
          </p>
          <ul className="space-y-[3px]">
            {cleanedAchievements.map((achievement, i) => (
              <li key={i} className="flex gap-1.5 font-bold text-black">
                <span className="shrink-0 mt-px" style={{ color: PREVIEW_NAVY }}>•</span>
                <span>{achievement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills */}
      {categorisedSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-bold pb-0.5 mb-1.5 border-b"
             style={{ color: PREVIEW_NAVY, borderColor: PREVIEW_NAVY }}>
            SKILLS
          </p>
          <div className="space-y-[3px]">
            {categorisedSkills.map((cat, i) => {
              const cleanItems = cat.items.map(clean).filter(Boolean);
              if (!cleanItems.length) return null;
              const categoryLabel = clean(cat.category);
              return (
                <p key={i} className="text-black">
                  {categoryLabel && <span className="font-bold">{categoryLabel}:  </span>}
                  <span className="text-[#333333]">{cleanItems.join('  ·  ')}</span>
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <div>
          <p className="text-[11px] font-bold pb-0.5 mb-2 border-b"
             style={{ color: PREVIEW_NAVY, borderColor: PREVIEW_NAVY }}>
            EDUCATION
          </p>
          {education.map((edu, i) => {
            const degree = clean(edu.degree);
            const institution = clean(edu.institution);
            const dates = clean(edu.dates);
            const location = clean(edu.location);
            const notes = clean(edu.notes);
            const institutionLine = [institution, location].filter(Boolean).join('  ·  ');
            if (!degree && !institution) return null;
            return (
              <div key={i} className="mb-2">
                <div className="flex justify-between items-start gap-2">
                  {degree && <p className="font-bold text-black">{degree}</p>}
                  {dates && <p className="text-[9px] text-[#555555] shrink-0">{dates}</p>}
                </div>
                {institutionLine && (
                  <p className="text-[9px] italic text-[#444444]">{institutionLine}</p>
                )}
                {notes && <p className="text-[9px] text-[#555555]">{notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Edit form ────────────────────────────────────────────────────────────────

type EditFormProps = {
  summary: string;
  onSummaryChange: (v: string) => void;
  bullets: string[][];
  experience: TailoredCvData['experience'];
  onBulletsChange: (v: string[][]) => void;
  onSave: () => void;
  onCancel: () => void;
};

function EditForm({
  summary,
  onSummaryChange,
  bullets,
  experience,
  onBulletsChange,
  onSave,
  onCancel,
}: EditFormProps) {
  function updateBullet(jobIdx: number, bulletIdx: number, value: string) {
    const next = bullets.map((arr) => [...arr]);
    next[jobIdx][bulletIdx] = value;
    onBulletsChange(next);
  }

  return (
    <div className="bg-gradient-to-br from-black/80 via-purple-900/30 to-black/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-6 sm:p-8 space-y-6">
      <h2 className="text-sm font-semibold text-purple-300 uppercase tracking-wider">Edit your CV</h2>

      <div className="space-y-2">
        <label htmlFor="summary" className="text-xs text-gray-400 font-medium">
          Professional Summary
        </label>
        <textarea
          id="summary"
          className="w-full min-h-[100px] p-3 bg-black/40 border border-purple-500/30 rounded-xl text-white text-sm leading-relaxed focus:outline-none focus:border-purple-400 transition-colors resize-none"
          value={summary}
          onChange={(e) => onSummaryChange(e.target.value)}
        />
      </div>

      {experience.map((job, i) => (
        <div key={i} className="space-y-2">
          <p className="text-xs font-semibold text-gray-300">
            {job.title} — {job.employer} ({job.dates})
          </p>
          {(bullets[i] ?? []).map((bullet, j) => {
            const bulletId = `bullet-${i}-${j}`;
            return (
              <div key={j} className="space-y-1">
                <label htmlFor={bulletId} className="sr-only">
                  Edit bullet {j + 1} for {job.title}
                </label>
                <textarea
                  id={bulletId}
                  className="w-full p-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-200 text-xs leading-relaxed focus:outline-none focus:border-purple-400 transition-colors resize-none"
                  value={bullet}
                  rows={2}
                  onChange={(e) => updateBullet(i, j, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex gap-3">
        <button
          onClick={onSave}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold text-sm hover:from-purple-600 hover:to-cyan-600 transition-all"
        >
          Save &amp; update PDF
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-full border border-white/10 bg-white/5 text-white text-sm hover:bg-white/10 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}