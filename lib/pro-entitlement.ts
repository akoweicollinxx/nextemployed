import { clerkClient } from '@clerk/nextjs/server';

export async function grantProEntitlement(userId: string): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { proGrantedAt: Date.now() },
  });
}

export async function revokeProEntitlement(userId: string): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { proGrantedAt: null },
  });
}