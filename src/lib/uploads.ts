import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

/**
 * Saves site photos next to the app and returns their public paths.
 * The Supabase swap replaces the body with a Storage upload; the signature
 * and the stored `photo_paths` stay the same.
 */
export async function savePhotos(projectId: string, files: File[]): Promise<string[]> {
  const usable = files.filter((f) => f && f.size > 0);
  if (usable.length === 0) return [];

  const dir = path.join(UPLOAD_ROOT, projectId);
  await fs.mkdir(dir, { recursive: true });

  const saved: string[] = [];
  for (const file of usable) {
    const ext = ALLOWED.get(file.type);
    if (!ext) throw new Error("Only JPEG, PNG and WebP photos can be attached.");
    if (file.size > MAX_BYTES) throw new Error("Each photo must be 5 MB or smaller.");
    const name = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + ext;
    await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    saved.push("/uploads/" + projectId + "/" + name);
  }
  return saved;
}
