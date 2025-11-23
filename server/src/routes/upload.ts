import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { uploadService } from '../services/upload.service.js';
import { requireAuth, type AuthContext } from '../middleware/auth.js';

const uploadRouter = new Hono<AuthContext>();

// All upload routes require auth
uploadRouter.use('*', requireAuth);

// Upload image via multipart form
uploadRouter.post('/image', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const folder = (body['folder'] as string) || 'images';

    const result = await uploadService.uploadFromFile(file, { folder });

    return c.json({
      success: true,
      file: {
        url: result.url,
        filename: result.filename,
        size: result.size,
        mimeType: result.mimeType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ error: message }, 400);
  }
});

// Upload image via base64
uploadRouter.post(
  '/image/base64',
  zValidator(
    'json',
    z.object({
      data: z.string(),
      filename: z.string().optional().default('image.jpg'),
      folder: z.string().optional().default('images'),
    })
  ),
  async (c) => {
    try {
      const { data, filename, folder } = c.req.valid('json');

      const result = await uploadService.uploadFromBase64(data, filename, { folder });

      return c.json({
        success: true,
        file: {
          url: result.url,
          filename: result.filename,
          size: result.size,
          mimeType: result.mimeType,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return c.json({ error: message }, 400);
    }
  }
);

// Upload image from URL
uploadRouter.post(
  '/image/url',
  zValidator(
    'json',
    z.object({
      url: z.string().url(),
      folder: z.string().optional().default('images'),
    })
  ),
  async (c) => {
    try {
      const { url, folder } = c.req.valid('json');

      const result = await uploadService.uploadFromUrl(url, { folder });

      return c.json({
        success: true,
        file: {
          url: result.url,
          filename: result.filename,
          size: result.size,
          mimeType: result.mimeType,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return c.json({ error: message }, 400);
    }
  }
);

// Delete image
uploadRouter.delete('/image', zValidator('json', z.object({ url: z.string() })), async (c) => {
  const { url } = c.req.valid('json');

  const deleted = await uploadService.deleteFile(url);

  if (!deleted) {
    return c.json({ error: 'File not found' }, 404);
  }

  return c.json({ success: true });
});

// Editor.js image upload endpoint
// This endpoint is specifically for Editor.js Image tool
uploadRouter.post('/editorjs/image', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['image'];

    if (!file || !(file instanceof File)) {
      return c.json({ success: 0, error: 'No file provided' });
    }

    const result = await uploadService.uploadFromFile(file, { folder: 'articles' });

    // Editor.js expects this format
    return c.json({
      success: 1,
      file: {
        url: result.url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ success: 0, error: message });
  }
});

// Editor.js image upload by URL
uploadRouter.post(
  '/editorjs/image/url',
  zValidator('json', z.object({ url: z.string().url() })),
  async (c) => {
    try {
      const { url } = c.req.valid('json');

      const result = await uploadService.uploadFromUrl(url, { folder: 'articles' });

      return c.json({
        success: 1,
        file: {
          url: result.url,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return c.json({ success: 0, error: message });
    }
  }
);

export { uploadRouter };
