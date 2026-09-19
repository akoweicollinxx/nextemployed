import { redis } from '@/lib/redis';

const KEY_PREFIX = 'try_submission:';
const TTL_SECONDS = 60 * 60; // 1 hour

export type SubmissionPayload = {
  cvText: string;
  jobDescription: string;
  teaserResult: string;
  submittedAt: number;
};

export async function storeSubmission(payload: SubmissionPayload): Promise<string> {
  const id = crypto.randomUUID();
  await redis.set(`${KEY_PREFIX}${id}`, payload, { ex: TTL_SECONDS });
  return id;
}

export async function getSubmission(id: string): Promise<SubmissionPayload | null> {
  return redis.get<SubmissionPayload>(`${KEY_PREFIX}${id}`);
}

export async function deleteSubmission(id: string): Promise<void> {
  await redis.del(`${KEY_PREFIX}${id}`);
}
