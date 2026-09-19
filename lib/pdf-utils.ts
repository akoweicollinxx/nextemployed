import { extractText, getDocumentProxy } from 'unpdf';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: true });

  if (!text || text.trim().length < 20) {
    throw new Error('PDF appears to have no extractable text — may be a scanned image');
  }

  return text;
}
