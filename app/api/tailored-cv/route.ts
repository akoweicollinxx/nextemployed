import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  checkMonthlyUserRateLimit,
  TAILORED_CV_MONTHLY_LIMIT,
} from '@/lib/rate-limit';
import { PRO_PLAN_SLUG } from '@/lib/plans';
import { track } from '@/lib/track';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a CV editor, not a CV writer. You will receive a candidate's existing CV and a job description. Your ONLY job is to restructure and reword what is already there — never invent content.

ABSOLUTE RULES — breaking any of these is a failure:
1. NEVER add a quantified result (number, %, £/$, headcount) that does not appear in the original CV.
2. NEVER add a job, role, employer, or responsibility that is not in the original CV.
3. NEVER add a skill, tool, or technology the candidate did not already list.
4. NEVER use filler phrases: "results-driven", "dynamic", "synergy", "leveraged", "spearheaded", "proactively", "passionate", "go-getter", "thought leader", "innovative", "strategic thinker", "detail-oriented". If any appear in the original, remove them.
5. ALWAYS preserve every employer name, job title, and date range exactly as given.
6. ALWAYS preserve every degree, institution, certification, and date exactly as given.
7. If the original CV has quantified achievements (e.g. "reduced costs by 30%"), they MUST appear in the rewritten version — do not drop them.

You MAY:
- Rewrite bullet points to surface JD-relevant aspects of real, stated experience
- Reorder sections, roles, and bullets to lead with the most relevant content
- Add ATS-relevant keywords from the JD only where the candidate's experience clearly supports them
- Tighten verbose phrasing (without removing substance)
- Write a 2–3 sentence professional summary tied to this specific role and the candidate's real background
- Reorganise skills under meaningful category labels (e.g. "Languages", "Frameworks", "Tools")

Also extract the job title and company name from the job description.

Return ONLY valid JSON with this exact shape — no markdown, no code fences, no explanation:
{
  "job_title": "string",
  "company": "string",
  "contact": {
    "name": "string",
    "title": "string — candidate's current or most recent job title",
    "email": "string",
    "phone": "string",
    "location": "string",
    "links": [{ "label": "string", "url": "string" }]
  },
  "summary": "string — 2–3 sentences, specific to this role",
  "experience": [
    {
      "title": "string",
      "employer": "string",
      "dates": "string",
      "location": "string",
      "bullets": ["string"]
    }
  ],
  "key_achievements": ["string — only include if the original CV has quantified wins; omit array or leave empty if not"],
  "skills": {
    "categorised": [
      { "category": "string", "items": ["string"] }
    ]
  },
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "dates": "string",
      "location": "string",
      "notes": "string — honours, GPA, relevant modules — only if present in original"
    }
  ],
  "flagged_gaps": ["string — JD requirement the CV does not clearly support; NOT added to the CV"]
}

If the CV is too sparse to tailor (under 200 words or no real experience), return { "error": "cv_too_sparse" } instead.`;

export async function POST(req: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Pro users bypass the monthly limit. Free users get 3/month.
  const rateCheck = has({ plan: PRO_PLAN_SLUG }) ? null : await checkMonthlyUserRateLimit(userId);
  if (rateCheck && !rateCheck.allowed) {
    track('tailored_cv_limit_hit', { userId });
    return NextResponse.json(
      { error: 'monthly_limit_reached', limit: TAILORED_CV_MONTHLY_LIMIT, resetDate: rateCheck.resetDate },
      { status: 429 }
    );
  }
  const remaining = rateCheck?.remaining ?? null;
  const resetDate = rateCheck?.resetDate ?? null;

  let body: { cvText?: string; jdText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const cvText = (body.cvText ?? '').trim().slice(0, 8000);
  const jdText = (body.jdText ?? '').trim().slice(0, 8000);

  if (cvText.length < 50) {
    return NextResponse.json({ error: 'CV text is too short.' }, { status: 400 });
  }
  if (jdText.length < 50) {
    return NextResponse.json({ error: 'Job description is too short.' }, { status: 400 });
  }

  track('tailored_cv_requested', { userId, cv_length: cvText.length, jd_length: jdText.length });

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const result = await generateText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt: `CV:\n${cvText}\n\nJob Description:\n${jdText}`,
      maxOutputTokens: 4000,
      abortSignal: controller.signal,
    });

    // Strip markdown code fences if the model adds them despite instructions
    const raw = result.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[tailored-cv] JSON parse failed. Raw output start:', raw.slice(0, 300));
      return NextResponse.json(
        { error: 'Failed to parse CV rewrite. Please try again.' },
        { status: 500 }
      );
    }

    if (parsed.error === 'cv_too_sparse') {
      track('tailored_cv_cv_too_sparse', { userId });
      return NextResponse.json({ error: 'cv_too_sparse' }, { status: 422 });
    }

    const duration_ms = Date.now() - startTime;
    const flaggedCount = Array.isArray(parsed.flagged_gaps) ? parsed.flagged_gaps.length : 0;
    track('tailored_cv_generated', { userId, duration_ms, flagged_gaps_count: flaggedCount });

    return NextResponse.json({ data: parsed, remaining, resetDate });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    track('tailored_cv_failed', {
      userId,
      error_type: isTimeout ? 'timeout' : 'openai_error',
      duration_ms: Date.now() - startTime,
    });
    console.error('[tailored-cv] AI error:', err);

    return NextResponse.json(
      { error: 'Our AI is having a moment. Try again in 30 seconds.' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}