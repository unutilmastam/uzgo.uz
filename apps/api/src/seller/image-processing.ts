import { PRODUCT_IMAGE_LIMITS } from '@uzgo/contracts';
import sharp from 'sharp';

/** Refuse decompression bombs before decoding pixels. */
const MAX_INPUT_PIXELS = 40_000_000;

export type ProcessedImage = { body: Buffer; width: number; height: number };

/**
 * Untrusted upload → clean WebP. The file is decoded by libvips (the declared
 * type and extension are ignored), auto-rotated, resized and re-encoded, which
 * drops EXIF/GPS metadata and any embedded payload. Returns null when the
 * bytes are not a supported image.
 */
export async function processProductImage(input: Buffer): Promise<ProcessedImage | null> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format)) {
      return null;
    }
    const { data, info } = await image
      .rotate()
      .resize({
        width: PRODUCT_IMAGE_LIMITS.maxSide,
        height: PRODUCT_IMAGE_LIMITS.maxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
