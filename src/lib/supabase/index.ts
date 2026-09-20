import "server-only";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Which backend the app is running on. The local JSON store stays the default
 * so the demo works with no network and no credentials; setting the Supabase
 * env vars switches every data call over.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Supabase renamed its keys: the publishable key (`sb_publishable_…`) replaces
 * the anon JWT, and the secret key (`sb_secret_…`) replaces the service role
 * JWT. Both namings work, so accept either.
 */
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Browser client — anon key only, RLS applies. */
export function browserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/** Server client bound to the request cookies, so RLS sees the signed-in user. */
export async function serverClient() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component: the middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Server only, never import from a client
 * component, and never expose the key to the browser.
 */
export function serviceClient() {
  const key = supabaseSecretKey();
  if (!key) throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
