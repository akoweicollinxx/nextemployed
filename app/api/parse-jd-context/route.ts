import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { checkUserRateLimit } from '@/lib/rate-limit';
import { PRO_PLAN_SLUG } from '@/lib/plans';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!has({ plan: PRO_PLAN_SLUG })) {
    const { allowed } = await checkUserRateLimit(userId);
    if (!allowed) {
      return NextResponse.json({ error: 'rate_limit' }, { status: 429 });
    }
  }

  let jdText: string;
  try {
    const body = await req.json();
    jdText = (body.jdText as string)?.trim() ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!jdText || jdText.length < 20) {
    return NextResponse.json({ role: null, company: null });
  }

  // Truncate to keep token usage low — 3 000 chars is plenty to find role/company
  const truncated = jdText.slice(0, 3000);

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: 'You extract structured data from job descriptions. Always respond with valid JSON only — no markdown, no explanation.',
      prompt: `Extract the job title/role and company name from this job description.
Return ONLY valid JSON in this exact format with no other text:
{"role": "...", "company": "..."}

Use null for any field you cannot determine with confidence.

Job description:
---
${truncated}`,
      maxOutputTokens: 100,
    });

    let parsed: { role?: string | null; company?: string | null } = {};
    try {
      // Strip markdown code fences if the model wraps the output
      const clean = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      // Parse failure — return nulls gracefully rather than erroring
    }

    return NextResponse.json({
      role: typeof parsed.role === 'string' ? parsed.role : null,
      company: typeof parsed.company === 'string' ? parsed.company : null,
    });
  } catch (err) {
    console.error('[parse-jd-context] error:', err);
    // Soft failure — the interview page degrades gracefully to "no context"
    return NextResponse.json({ role: null, company: null });
  }
}
