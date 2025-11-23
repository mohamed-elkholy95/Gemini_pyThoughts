import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../config/logger.js';

// Image processing configuration
const IMAGE_CONFIG = {
  maxWidth: 2000,
  maxHeight: 2000,
  quality: {
    jpeg: 85,
    webp: 85,
    png: 85,
    avif: 80,
  },
  thumbnailSizes: {
    small: { width: 150, height: 150 },
    medium: { width: 400, height: 300 },
    large: { width: 800, height: 600 },
  },
  coverImageSizes: {
    thumbnail: { width: 400, height: 225 }, // 16:9
    preview: { width: 800, height: 450 },
    full: { width: 1200, height: 675 },
  },
  avatarSizes: {
    small: { width: 48, height: 48 },
    medium: { width: 96, height: 96 },
    large: { width: 256, height: 256 },
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};

interface ProcessedImage {
  original: string;
  variants: Record<string, string>;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

interface ImageVariant {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export const imageService = {
  // Process and optimize an image
  async processImage(
    inputPath: string,
    outputDir: string,
    options: {
      variants?: Record<string, ImageVariant>;
      format?: 'jpeg' | 'webp' | 'png' | 'avif';
      quality?: number;
    } = {}
  ): Promise<ProcessedImage> {
    const { variants = {}, format = 'webp', quality = IMAGE_CONFIG.quality[format] } = options;

    try {
      // Read original image
      const image = sharp(inputPath);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image dimensions');
      }

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      const baseName = path.basename(inputPath, path.extname(inputPath));
      const results: Record<string, string> = {};

      // Process original (optimize and possibly resize if too large)
      let processedOriginal = image.clone();
      if (metadata.width > IMAGE_CONFIG.maxWidth || metadata.height > IMAGE_CONFIG.maxHeight) {
        processedOriginal = processedOriginal.resize(IMAGE_CONFIG.maxWidth, IMAGE_CONFIG.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const originalPath = path.join(outputDir, `${baseName}.${format}`);
      await this.saveWithFormat(processedOriginal, originalPath, format, quality);
      results.original = originalPath;

      // Generate variants
      for (const [name, size] of Object.entries(variants)) {
        const variantPath = path.join(outputDir, `${baseName}_${name}.${format}`);
        const variantImage = sharp(inputPath).resize(size.width, size.height, {
          fit: size.fit || 'cover',
          position: 'centre',
        });

        await this.saveWithFormat(variantImage, variantPath, format, quality);
        results[name] = variantPath;
      }

      // Get final metadata
      const finalMeta = await sharp(results.original).metadata();

      logger.info({ inputPath, outputDir, variants: Object.keys(variants) }, 'Image processed');

      return {
        original: results.original,
        variants: results,
        metadata: {
          width: finalMeta.width || 0,
          height: finalMeta.height || 0,
          format: finalMeta.format || format,
          size: (await fs.stat(results.original)).size,
        },
      };
    } catch (error) {
      logger.error({ error, inputPath }, 'Image processing failed');
      throw error;
    }
  },

  // Save image with specific format
  async saveWithFormat(
    image: sharp.Sharp,
    outputPath: string,
    format: 'jpeg' | 'webp' | 'png' | 'avif',
    quality: number
  ): Promise<void> {
    switch (format) {
      case 'jpeg':
        await image.jpeg({ quality, progressive: true }).toFile(outputPath);
        break;
      case 'webp':
        await image.webp({ quality }).toFile(outputPath);
        break;
      case 'png':
        await image.png({ quality, compressionLevel: 9 }).toFile(outputPath);
        break;
      case 'avif':
        await image.avif({ quality }).toFile(outputPath);
        break;
    }
  },

  // Process cover image with standard sizes
  async processCoverImage(inputPath: string, articleId: string): Promise<ProcessedImage> {
    const outputDir = path.join(IMAGE_CONFIG.uploadDir, 'covers', articleId);
    return this.processImage(inputPath, outputDir, {
      variants: IMAGE_CONFIG.coverImageSizes,
      format: 'webp',
    });
  },

  // Process avatar image with standard sizes
  async processAvatar(inputPath: string, userId: string): Promise<ProcessedImage> {
    const outputDir = path.join(IMAGE_CONFIG.uploadDir, 'avatars', userId);
    return this.processImage(inputPath, outputDir, {
      variants: IMAGE_CONFIG.avatarSizes,
      format: 'webp',
    });
  },

  // Process article content image
  async processContentImage(inputPath: string, articleId: string): Promise<ProcessedImage> {
    const outputDir = path.join(IMAGE_CONFIG.uploadDir, 'content', articleId);
    return this.processImage(inputPath, outputDir, {
      variants: IMAGE_CONFIG.thumbnailSizes,
      format: 'webp',
    });
  },

  // Generate blur placeholder (LQIP - Low Quality Image Placeholder)
  async generateBlurPlaceholder(inputPath: string): Promise<string> {
    const buffer = await sharp(inputPath)
      .resize(20, 20, { fit: 'inside' })
      .blur()
      .webp({ quality: 20 })
      .toBuffer();

    return `data:image/webp;base64,${buffer.toString('base64')}`;
  },

  // Generate dominant color from image
  async getDominantColor(inputPath: string): Promise<string> {
    const { dominant } = await sharp(inputPath).stats();
    const { r, g, b } = dominant;
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  },

  // Optimize existing image in place
  async optimizeInPlace(imagePath: string): Promise<{ originalSize: number; optimizedSize: number; savings: number }> {
    const originalStats = await fs.stat(imagePath);
    const originalSize = originalStats.size;

    const ext = path.extname(imagePath).toLowerCase();
    const format = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : ext.slice(1) as 'webp' | 'png';

    const buffer = await sharp(imagePath)
      .resize(IMAGE_CONFIG.maxWidth, IMAGE_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(format, { quality: IMAGE_CONFIG.quality[format] || 85 })
      .toBuffer();

    await fs.writeFile(imagePath, buffer);

    const optimizedSize = buffer.length;
    const savings = Math.round((1 - optimizedSize / originalSize) * 100);

    return { originalSize, optimizedSize, savings };
  },

  // Convert image to different format
  async convertFormat(
    inputPath: string,
    outputFormat: 'jpeg' | 'webp' | 'png' | 'avif'
  ): Promise<string> {
    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(dir, `${baseName}.${outputFormat}`);

    const image = sharp(inputPath);
    await this.saveWithFormat(image, outputPath, outputFormat, IMAGE_CONFIG.quality[outputFormat]);

    return outputPath;
  },

  // Get image metadata
  async getMetadata(imagePath: string) {
    const meta = await sharp(imagePath).metadata();
    return {
      width: meta.width,
      height: meta.height,
      format: meta.format,
      space: meta.space,
      channels: meta.channels,
      depth: meta.depth,
      density: meta.density,
      hasAlpha: meta.hasAlpha,
      orientation: meta.orientation,
    };
  },

  // Check if file is a valid image
  async isValidImage(filePath: string): Promise<boolean> {
    try {
      const meta = await sharp(filePath).metadata();
      return !!meta.format && !!meta.width && !!meta.height;
    } catch {
      return false;
    }
  },

  // Generate responsive image srcset
  async generateSrcSet(
    inputPath: string,
    outputDir: string,
    widths: number[] = [320, 640, 960, 1280, 1920]
  ): Promise<{ srcset: string; sizes: string }> {
    await fs.mkdir(outputDir, { recursive: true });

    const baseName = path.basename(inputPath, path.extname(inputPath));
    const srcsetParts: string[] = [];

    for (const width of widths) {
      const outputPath = path.join(outputDir, `${baseName}_${width}w.webp`);
      await sharp(inputPath)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: IMAGE_CONFIG.quality.webp })
        .toFile(outputPath);

      srcsetParts.push(`${outputPath} ${width}w`);
    }

    return {
      srcset: srcsetParts.join(', '),
      sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    };
  },

  // Clean up processed images for an entity
  async cleanupImages(entityType: 'covers' | 'avatars' | 'content', entityId: string): Promise<void> {
    const dir = path.join(IMAGE_CONFIG.uploadDir, entityType, entityId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
      logger.info({ entityType, entityId }, 'Images cleaned up');
    } catch (error) {
      logger.error({ error, entityType, entityId }, 'Failed to cleanup images');
    }
  },
};
