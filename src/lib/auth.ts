import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/store";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import type { Profile } from "@/lib/domain/types";

export const SESSION_COOKIE = "pwfts_uid";

/**
 * Demo authentication. The whole app reads the signed-in user through
 * currentUser(), so replacing this with Supabase Auth is a single-file change.
 */
export async function currentUser(): Promise<Profile | null> {
  const jar = await cookies();
  const uid = jar.get(SESSION_COOKIE)?.value;
  if (!uid) return null;
  return getDb().profiles.find((p) => p.id === uid) ?? null;
}

export async function requireUser(): Promise<Profile> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export function verifyCredentials(email: string, password: string): Profile | null {
  if (password !== DEMO_PASSWORD) return null;
  const normalised = email.trim().toLowerCase();
  return getDb().profiles.find((p) => p.email.toLowerCase() === normalised) ?? null;
}

export function demoAccounts(): Profile[] {
  return getDb().profiles;
}
