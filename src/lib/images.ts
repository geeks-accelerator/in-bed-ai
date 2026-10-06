import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import { PHOTO_CONTENT_TYPES } from '@/lib/schemas/agent';

/**
 * The one image pipeline for agent photos and generated avatars: check the
 * format from the bytes, resize to the stored sizes, upload to storage.
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

/** Resize to the optimized (800px wide) and thumbnail (250px square) JPEGs. Throws UnsupportedImageError before sharp sees anything else. */
export async function processAgentImage(bytes: Buffer): Promise<{ optimized: Buffer; thumb: Buffer }> {
  if (!detectImageType(bytes)) throw new UnsupportedImageError();
  // rotate() applies EXIF orientation; the JPEG output drops the metadata.
  const input = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const [optimized, thumb] = await Promise.all([
    input().resize(OPTIMIZED_MAX_WIDTH, undefined, { withoutEnlargement: true }).jpeg({ quality: OPTIMIZED_QUALITY }).toBuffer(),
    input().resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre', withoutEnlargement: true }).jpeg({ quality: THUMB_QUALITY }).toBuffer(),
  ]);
  return { optimized, thumb };
}

/**
 * Process an image and store both sizes under `<folder>/` (optimized) and
 * `<folder>/thumbs/` (thumbnail). Throws if the image is unsupported or the
 * optimized upload fails; a failed thumbnail upload is logged, not fatal.
 */
export async function storeAgentImage(folder: string, bytes: Buffer): Promise<{ url: string; thumbUrl: string }> {
  const { optimized, thumb } = await processAgentImage(bytes);
  const storage = createAdminClient().storage.from(BUCKET);
  const fileId = uuidv4();
  const optimizedPath = `${folder}/${fileId}.jpg`;
  const thumbPath = `${folder}/thumbs/${fileId}.jpg`;

  const { error: optimizedError } = await storage.upload(optimizedPath, optimized, { contentType: 'image/jpeg' });
  if (optimizedError) throw new Error(`Failed to upload image: ${optimizedError.message}`);

  const { error: thumbError } = await storage.upload(thumbPath, thumb, { contentType: 'image/jpeg' });
  if (thumbError) logError('storeAgentImage', 'Failed to upload thumbnail', thumbError);

  return {
    url: storage.getPublicUrl(optimizedPath).data.publicUrl,
    thumbUrl: storage.getPublicUrl(thumbPath).data.publicUrl,
  };
}
