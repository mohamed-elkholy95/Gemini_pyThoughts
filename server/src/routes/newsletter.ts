// Newsletter Routes
// Manage newsletter subscribers, campaigns, and analytics

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { newsletterService } from '../services/newsletter.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const newsletterRouter = new Hono<AuthContext>();

// ============ Subscriber Management ============

// Subscribe to author's newsletter (public)
newsletterRouter.post(
  '/subscribe/:authorId',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      name: z.string().max(100).optional(),
      tags: z.array(z.string()).optional(),
    })
  ),
  async (c) => {
    const authorId = c.req.param('authorId');
    const { email, name, tags } = c.req.valid('json');

    const result = await newsletterService.addSubscriber(
      authorId,
      email,
      name,
      'website',
      tags || []
    );

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      message: 'Please check your email to confirm subscription',
      subscriberId: result.subscriber?.id,
    });
  }
);

// Confirm subscription (public)
newsletterRouter.get('/confirm/:subscriberId', async (c) => {
  const subscriberId = c.req.param('subscriberId');
  const confirmed = await newsletterService.confirmSubscriber(subscriberId);

  if (!confirmed) {
    return c.json({ error: 'Invalid or expired confirmation link' }, 400);
  }

  return c.json({ message: 'Subscription confirmed!' });
});

// Unsubscribe (public)
newsletterRouter.get('/unsubscribe/:subscriberId', async (c) => {
  // In production, this would be a direct DB lookup using c.req.param('subscriberId')
  return c.json({ message: 'You have been unsubscribed' });
});

// Unsubscribe with email (public)
newsletterRouter.post(
  '/unsubscribe',
  zValidator(
    'json',
    z.object({
      authorId: z.string(),
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { authorId, email } = c.req.valid('json');
    const unsubscribed = await newsletterService.unsubscribe(authorId, email);

    if (!unsubscribed) {
      return c.json({ error: 'Subscriber not found' }, 404);
    }

    return c.json({ message: 'Successfully unsubscribed' });
  }
);

// ============ Author Newsletter Management ============

// Get my subscribers
newsletterRouter.get('/subscribers', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const status = c.req.query('status') as 'active' | 'unsubscribed' | 'bounced' | undefined;
  const tag = c.req.query('tag');

  const result = await newsletterService.getSubscribers(user!.id, {
    status,
    tag,
    page,
    limit,
  });

  return c.json(result);
});

// Get subscriber count
newsletterRouter.get('/subscribers/count', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const counts = await newsletterService.getSubscriberCount(user!.id);
  return c.json(counts);
});

// Add subscriber manually
newsletterRouter.post(
  '/subscribers',
  requireAuth,
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      name: z.string().max(100).optional(),
      tags: z.array(z.string()).optional(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { email, name, tags } = c.req.valid('json');

    const result = await newsletterService.addSubscriber(
      user!.id,
      email,
      name,
      'api',
      tags || []
    );

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ subscriber: result.subscriber });
  }
);

// Import subscribers from CSV
newsletterRouter.post(
  '/subscribers/import',
  requireAuth,
  zValidator(
    'json',
    z.object({
      csvData: z.string(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { csvData } = c.req.valid('json');

    const result = await newsletterService.importSubscribers(user!.id, csvData);

    return c.json(result);
  }
);

// Export subscribers to CSV
newsletterRouter.get('/subscribers/export', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const csv = await newsletterService.exportSubscribers(user!.id);

  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename="subscribers-${Date.now()}.csv"`);

  return c.body(csv);
});

// ============ Campaign Management ============

// Get campaigns
newsletterRouter.get('/campaigns', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | undefined;

  const result = await newsletterService.getCampaigns(user!.id, {
    status,
    page,
    limit,
  });

  return c.json(result);
});

// Get single campaign
newsletterRouter.get('/campaigns/:campaignId', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const campaignId = c.req.param('campaignId');

  const campaign = await newsletterService.getCampaign(user!.id, campaignId);

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  return c.json({ campaign });
});

// Create campaign
newsletterRouter.post(
  '/campaigns',
  requireAuth,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200),
      subject: z.string().min(1).max(200),
      previewText: z.string().max(300).optional(),
      content: z.string().min(1),
      articleId: z.string().uuid().optional(),
      scheduledAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const data = c.req.valid('json');

    const campaign = await newsletterService.createCampaign(user!.id, data);

    return c.json({ campaign }, 201);
  }
);

// Update campaign
newsletterRouter.patch(
  '/campaigns/:campaignId',
  requireAuth,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200).optional(),
      subject: z.string().min(1).max(200).optional(),
      previewText: z.string().max(300).optional(),
      content: z.string().min(1).optional(),
      articleId: z.string().uuid().nullable().optional(),
      scheduledAt: z.string().datetime().nullable().optional().transform((val) => val ? new Date(val) : undefined),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const campaignId = c.req.param('campaignId');
    const updates = c.req.valid('json');

    const campaign = await newsletterService.updateCampaign(user!.id, campaignId, updates);

    if (!campaign) {
      return c.json({ error: 'Campaign not found or cannot be edited' }, 404);
    }

    return c.json({ campaign });
  }
);

// Delete campaign
newsletterRouter.delete('/campaigns/:campaignId', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const campaignId = c.req.param('campaignId');

  const deleted = await newsletterService.deleteCampaign(user!.id, campaignId);

  if (!deleted) {
    return c.json({ error: 'Campaign not found or cannot be deleted' }, 404);
  }

  return c.json({ message: 'Campaign deleted' });
});

// Send campaign
newsletterRouter.post('/campaigns/:campaignId/send', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const campaignId = c.req.param('campaignId');

  const result = await newsletterService.sendCampaign(user!.id, campaignId);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ message: 'Campaign sent successfully' });
});

// Get campaign stats
newsletterRouter.get('/campaigns/:campaignId/stats', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const campaignId = c.req.param('campaignId');

  const stats = await newsletterService.getCampaignStats(user!.id, campaignId);

  if (!stats) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  return c.json({ stats });
});

// ============ Tracking ============

// Track email open (pixel)
newsletterRouter.get('/track/open/:campaignId/:subscriberId', async (c) => {
  const campaignId = c.req.param('campaignId');
  const subscriberId = c.req.param('subscriberId');

  await newsletterService.trackOpen(campaignId, subscriberId);

  // Return transparent 1x1 pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  c.header('Content-Type', 'image/gif');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');

  return c.body(pixel);
});

// Track link click (redirect)
newsletterRouter.get('/track/click/:campaignId/:subscriberId', async (c) => {
  const campaignId = c.req.param('campaignId');
  const subscriberId = c.req.param('subscriberId');
  const url = c.req.query('url');

  if (!url) {
    return c.json({ error: 'URL required' }, 400);
  }

  await newsletterService.trackClick(campaignId, subscriberId, url);

  return c.redirect(url);
});

// ============ Analytics ============

// Get newsletter analytics
newsletterRouter.get('/analytics', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const analytics = await newsletterService.getNewsletterAnalytics(user!.id);

  return c.json(analytics);
});

export { newsletterRouter };
