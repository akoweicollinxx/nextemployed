import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdf-utils';
import { checkUserRateLimit } from '@/lib/rate-limit';
import { PRO_PLAN_SLUG } from '@/lib/plans';

export const runtime = 'nodejs';

const MAX_CV_FILE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const { userId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!has({ plan: PRO_PLAN_SLUG })) {
    const { allowed } = await checkUserRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'You have reached your daily limit. Try again tomorrow.' },
        { status: 429 }
      );
    }
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Invalid content type.' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the form data.' }, { status: 400 });
  }

  const cvFile = formData.get('cvFile') as File | null;
  if (!cvFile || cvFile.size === 0) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  if (!cvFile.size || cvFile.size > MAX_CV_FILE_BYTES) {
    return NextResponse.json(
      { error: 'File is too large. Upload a file under 5MB.' },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await cvFile.arrayBuffer());
  const name = cvFile.name.toLowerCase();

  let cvText = '';

  if (name.endsWith('.pdf')) {
    try {
      cvText = await extractTextFromPDF(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isScanned = msg.includes('scanned image');
      return NextResponse.json(
        {
          error: isScanned
            ? 'Your PDF appears to be a scanned image. Please paste your CV text or upload a text-based PDF (exported from Word, Google Docs, or similar).'
            : 'Could not read your PDF. Try pasting your CV text instead, or upload a different PDF file.',
        },
        { status: 400 }
      );
    }
  } else if (name.endsWith('.docx')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      cvText = value;
    } catch {
      return NextResponse.json(
        { error: 'Could not read your DOCX file. Try pasting your CV text instead.' },
        { status: 400 }
      );
    }
  } else if (name.endsWith('.txt')) {
    cvText = buffer.toString('utf-8');
  } else {
    return NextResponse.json(
      { error: 'Only PDF, DOCX, and TXT files are supported.' },
      { status: 400 }
    );
  }

  cvText = cvText.trim().slice(0, 8000);

  if (cvText.length < 50) {
    return NextResponse.json(
      { error: 'The file appears to be empty or contains too little text. Try pasting your CV text instead.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ cvText });
}
