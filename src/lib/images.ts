import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError, logWarn } from '@/lib/logger';
import { PHOTO_CONTENT_TYPES } from '@/lib/schemas/agent';

/**
 * The one image pipeline for agent photos and generated avatars: check the
 * format from the bytes, resize to the stored sizes, upload to storage, and
 * remove every size when a photo is deleted.
 *
 * Each image is stored as three files sharing one id, so any one locates the
 * others: `<folder>/<id>.jpg` (optimized, shown on profiles),
 * `<folder>/thumbs/<id>.jpg`, and `<folder>/masters/<id>.webp` (a re-encoded
 * high-resolution copy kept for future features, not referenced anywhere yet).
 *
 * Only JPEG, PNG, WebP and GIF reach sharp. The format is read from the magic
 * bytes, never from a declared content type, because sharp decodes whatever
 * the bytes are (an AVIF labeled image/jpeg would go to libheif).
 */

export type ImageType = (typeof PHOTO_CONTENT_TYPES)[number];

const BUCKET = 'agent-photos';
const OPTIMIZED_MAX_WIDTH = 800;
const OPTIMIZED_QUALITY = 80;
const THUMB_SIZE = 250;
const THUMB_QUALITY = 75;
/** Longest side of the master copy. Covers every upload seen so far (max 1920px). */
const MASTER_MAX_SIZE = 2048;
/** WebP keeps PNG transparency and is smaller than JPEG at this quality. */
const MASTER_QUALITY = 90;
/** Decoded-size cap (uploads are at most 5 MB, but a small file can decode huge). */
const MAX_INPUT_PIXELS = 40_000_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image type from the file's magic bytes, or null if it isn't one we accept. */
export function detectImageType(bytes: Buffer): ImageType | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super(`Unsupported image format: send ${PHOTO_CONTENT_TYPES.join(', ')}`);
    this.name = 'UnsupportedImageError';
  }
}

/**
 * Resize to the master (≤2048px WebP), optimized (≤800px wide JPEG) and
 * thumbnail (250px square JPEG). Throws UnsupportedImageError before sharp
 * sees anything else.
 */
export async function processAgentImage(bytes: Buffer): Promise<{ master: Buffer; optimized: Buffer; thumb: Buffer }> {
  if (!detectImageType(bytes)) throw new UnsupportedImageError();
  // rotate() applies EXIF orientation; the outputs drop the metadata.
  const input = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const [master, optimized, thumb] = await Promise.all([
    input().resize(MASTER_MAX_SIZE, MASTER_MAX_SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: MASTER_QUALITY }).toBuffer(),
    input().resize(OPTIMIZED_MAX_WIDTH, undefined, { withoutEnlargement: true }).jpeg({ quality: OPTIMIZED_QUALITY }).toBuffer(),
    input().resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre', withoutEnlargement: true }).jpeg({ quality: THUMB_QUALITY }).toBuffer(),
  ]);
  return { master, optimized, thumb };
}

const imagePaths = (folder: string, fileId: string) => ({
  optimized: `${folder}/${fileId}.jpg`,
  thumb: `${folder}/thumbs/${fileId}.jpg`,
  master: `${folder}/masters/${fileId}.webp`,
});

/**
 * Process an image and store all three sizes. Throws if the image is
 * unsupported or the optimized upload fails; a failed thumbnail or master
 * upload is logged, not fatal.
 */
export async function storeAgentImage(folder: string, bytes: Buffer): Promise<{ url: string; thumbUrl: string }> {
  const { master, optimized, thumb } = await processAgentImage(bytes);
  const storage = createAdminClient().storage.from(BUCKET);
  const paths = imagePaths(folder, uuidv4());

  const { error: optimizedError } = await storage.upload(paths.optimized, optimized, { contentType: 'image/jpeg' });
  if (optimizedError) throw new Error(`Failed to upload image: ${optimizedError.message}`);

  const [{ error: thumbError }, { error: masterError }] = await Promise.all([
    storage.upload(paths.thumb, thumb, { contentType: 'image/jpeg' }),
    storage.upload(paths.master, master, { contentType: 'image/webp' }),
  ]);
  if (thumbError) logError('storeAgentImage', 'Failed to upload thumbnail', thumbError);
  if (masterError) logError('storeAgentImage', 'Failed to upload master copy', masterError);

  return {
    url: storage.getPublicUrl(paths.optimized).data.publicUrl,
    thumbUrl: storage.getPublicUrl(paths.thumb).data.publicUrl,
  };
}

/**
 * Delete every stored size of an image, given its optimized (profile) URL:
 * thumbnail, master, and the `originals/` copy that uploads before
 * 2026-10-06 also kept. Failures are logged, not thrown: the photo is
 * already gone from the profile when this runs.
 */
export async function removeAgentImage(optimizedUrl: string): Promise<void> {
  const storage = createAdminClient().storage.from(BUCKET);
  const marker = `/object/public/${BUCKET}/`;
  const at = optimizedUrl.indexOf(marker);
  const match = at >= 0 ? optimizedUrl.slice(at + marker.length).match(/^(.+)\/([^/]+)\.jpg$/) : null;
  if (!match) {
    logWarn('removeAgentImage', 'Not an image in our bucket; nothing removed', { optimizedUrl });
    return;
  }
  const [, folder, fileId] = match;
  const paths = imagePaths(folder, fileId);

  // Pre-2026-10-06 originals kept the upload's own extension.
  const { data: originals } = await storage.list(`${folder}/originals`, { search: fileId });
  const originalPaths = (originals ?? []).filter((o) => o.name.startsWith(`${fileId}.`)).map((o) => `${folder}/originals/${o.name}`);

  const { error } = await storage.remove([paths.optimized, paths.thumb, paths.master, ...originalPaths]);
  if (error) logError('removeAgentImage', 'Failed to remove stored image files', error);
}
