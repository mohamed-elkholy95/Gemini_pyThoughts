import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Supported image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Get upload directory from env or default
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

interface UploadOptions {
  maxSize?: number;
  allowedTypes?: string[];
  folder?: string;
}

export const uploadService = {
  // Generate unique filename
  generateFilename(originalName: string): string {
    const ext = extname(originalName).toLowerCase() || '.jpg';
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString(36);
    return `${timestamp}-${hash}${ext}`;
  },

  // Validate file
  validateFile(file: { size: number; type: string }, options: UploadOptions = {}): { valid: boolean; error?: string } {
    const maxSize = options.maxSize || MAX_FILE_SIZE;
    const allowedTypes = options.allowedTypes || ALLOWED_TYPES;

    if (file.size > maxSize) {
      return { valid: false, error: `File size exceeds ${maxSize / 1024 / 1024}MB limit` };
    }

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: `File type ${file.type} is not allowed` };
    }

    return { valid: true };
  },

  // Upload file from buffer/stream (local storage)
  async uploadLocal(
    fileData: Buffer | Readable,
    originalName: string,
    mimeType: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const folder = options.folder || 'images';
    const uploadPath = join(UPLOAD_DIR, folder);

    // Ensure folder exists
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }

    const filename = this.generateFilename(originalName);
    const filePath = join(uploadPath, filename);

    // Write file
    if (Buffer.isBuffer(fileData)) {
      const writeStream = createWriteStream(filePath);
      await pipeline(Readable.from(fileData), writeStream);
    } else {
      const writeStream = createWriteStream(filePath);
      await pipeline(fileData, writeStream);
    }

    // Get file size
    const size = Buffer.isBuffer(fileData) ? fileData.length : 0;

    // Generate URL
    const url = `/uploads/${folder}/${filename}`;

    logger.info({ filename, folder, size }, 'File uploaded locally');

    return {
      url,
      filename,
      size,
      mimeType,
    };
  },

  // Upload from File object (multipart form)
  async uploadFromFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    // Validate
    const validation = this.validateFile({ size: file.size, type: file.type }, options);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return this.uploadLocal(buffer, file.name, file.type, options);
  },

  // Upload from base64 string
  async uploadFromBase64(base64Data: string, filename: string, options: UploadOptions = {}): Promise<UploadResult> {
    // Parse base64 data URL
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data URL');
    }

    const mimeType = matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    // Validate
    const validation = this.validateFile({ size: buffer.length, type: mimeType }, options);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return this.uploadLocal(buffer, filename, mimeType, options);
  },

  // Upload from URL (fetch and save)
  async uploadFromUrl(imageUrl: string, options: UploadOptions = {}): Promise<UploadResult> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    // Validate type
    const allowedTypes = options.allowedTypes || ALLOWED_TYPES;
    if (!allowedTypes.some((type) => contentType.startsWith(type.split('/')[0]))) {
      throw new Error(`File type ${contentType} is not allowed`);
    }

    // Validate size if known
    const maxSize = options.maxSize || MAX_FILE_SIZE;
    if (contentLength > maxSize) {
      throw new Error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract filename from URL
    const urlPath = new URL(imageUrl).pathname;
    const filename = urlPath.split('/').pop() || 'image.jpg';

    return this.uploadLocal(buffer, filename, contentType, options);
  },

  // Delete file
  async deleteFile(url: string): Promise<boolean> {
    try {
      // Extract path from URL
      const relativePath = url.replace('/uploads/', '');
      const filePath = join(UPLOAD_DIR, relativePath);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
        logger.info({ filePath }, 'File deleted');
        return true;
      }

      return false;
    } catch (error) {
      logger.error({ error, url }, 'Failed to delete file');
      return false;
    }
  },

  // Get full URL for a file
  getFullUrl(relativePath: string): string {
    const baseUrl = process.env.BASE_URL || `http://localhost:${env.PORT}`;
    return `${baseUrl}${relativePath}`;
  },
};
