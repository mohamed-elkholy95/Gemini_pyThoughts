// Subscription Routes
// Handle subscription management, billing, and membership tiers

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { subscriptionService, type MembershipTier } from '../services/subscription.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const subscriptionsRouter = new Hono<AuthContext>();

// Get all available tiers
subscriptionsRouter.get('/tiers', async (c) => {
  const tiers = subscriptionService.getAllTiers();
  return c.json({ tiers });
});

// Get specific tier details
subscriptionsRouter.get('/tiers/:tier', async (c) => {
  const tier = c.req.param('tier') as MembershipTier;
  const validTiers = ['free', 'basic', 'pro', 'enterprise'];

  if (!validTiers.includes(tier)) {
    return c.json({ error: 'Invalid tier' }, 400);
  }

  const config = subscriptionService.getTierConfig(tier);
  return c.json({ tier, config });
});

// Get current user's subscription
subscriptionsRouter.get('/current', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const subscription = await subscriptionService.getSubscription(user!.id);

  if (!subscription) {
    return c.json({ error: 'No subscription found' }, 404);
  }

  return c.json({ subscription });
});

// Get subscription summary with usage
subscriptionsRouter.get('/summary', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const summary = await subscriptionService.getSubscriptionSummary(user!.id);
  return c.json(summary);
});

// Create/upgrade subscription
subscriptionsRouter.post(
  '/',
  requireAuth,
  zValidator(
    'json',
    z.object({
      tier: z.enum(['free', 'basic', 'pro', 'enterprise']),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
      paymentMethodId: z.string().optional(),
      promoCode: z.string().optional(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { tier, billingCycle, paymentMethodId, promoCode } = c.req.valid('json');

    // Apply promo code if provided
    let discount = 0;
    if (promoCode) {
      const promoResult = await subscriptionService.applyPromoCode(user!.id, promoCode);
      if (promoResult.success) {
        discount = promoResult.discount;
      }
    }

    const result = await subscriptionService.createSubscription(
      user!.id,
      tier as MembershipTier,
      billingCycle,
      paymentMethodId
    );

    return c.json({
      subscription: result.subscription,
      discount,
      message: 'Subscription created successfully',
    });
  }
);

// Upgrade subscription
subscriptionsRouter.post(
  '/upgrade',
  requireAuth,
  zValidator(
    'json',
    z.object({
      tier: z.enum(['basic', 'pro', 'enterprise']),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { tier } = c.req.valid('json');

    try {
      const subscription = await subscriptionService.upgradeSubscription(
        user!.id,
        tier as MembershipTier
      );
      return c.json({ subscription, message: 'Subscription upgraded successfully' });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  }
);

// Cancel subscription
subscriptionsRouter.post(
  '/cancel',
  requireAuth,
  zValidator(
    'json',
    z.object({
      immediately: z.boolean().default(false),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { immediately } = c.req.valid('json');

    try {
      const subscription = await subscriptionService.cancelSubscription(user!.id, immediately);
      return c.json({
        subscription,
        message: immediately
          ? 'Subscription canceled immediately'
          : 'Subscription will cancel at end of billing period',
      });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  }
);

// Resume canceled subscription
subscriptionsRouter.post('/resume', requireAuth, async (c) => {
  const user = getCurrentUser(c);

  try {
    const subscription = await subscriptionService.resumeSubscription(user!.id);
    return c.json({ subscription, message: 'Subscription resumed' });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Apply promo code
subscriptionsRouter.post(
  '/promo',
  requireAuth,
  zValidator(
    'json',
    z.object({
      code: z.string().min(1).max(50),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { code } = c.req.valid('json');

    const result = await subscriptionService.applyPromoCode(user!.id, code);
    return c.json(result, result.success ? 200 : 400);
  }
);

// Check feature access
subscriptionsRouter.get(
  '/features/:feature',
  requireAuth,
  async (c) => {
    const user = getCurrentUser(c);
    const feature = c.req.param('feature');

    const validFeatures = [
      'articlesPerMonth',
      'storageGB',
      'customDomain',
      'analytics',
      'prioritySupport',
      'apiAccess',
      'teamMembers',
      'scheduledPosts',
      'removeAds',
      'newsletterSubscribers',
    ];

    if (!validFeatures.includes(feature)) {
      return c.json({ error: 'Invalid feature' }, 400);
    }

    const hasAccess = await subscriptionService.hasFeatureAccess(
      user!.id,
      feature as keyof ReturnType<typeof subscriptionService.getTierConfig>['limits']
    );

    return c.json({ feature, hasAccess });
  }
);

// Check limit
subscriptionsRouter.get(
  '/limits/:limitType',
  requireAuth,
  zValidator(
    'query',
    z.object({
      currentUsage: z.coerce.number().int().min(0).default(0),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const limitType = c.req.param('limitType');
    const { currentUsage } = c.req.valid('query');

    const result = await subscriptionService.checkLimit(
      user!.id,
      limitType as keyof ReturnType<typeof subscriptionService.getTierConfig>['limits'],
      currentUsage
    );

    return c.json(result);
  }
);

// Get usage statistics
subscriptionsRouter.get('/usage', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const usage = await subscriptionService.getUsageStats(user!.id);
  return c.json({ usage });
});

// Get invoices
subscriptionsRouter.get('/invoices', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const invoiceList = await subscriptionService.getInvoices(user!.id);
  return c.json({ invoices: invoiceList });
});

// Get single invoice
subscriptionsRouter.get('/invoices/:invoiceId', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const invoiceId = c.req.param('invoiceId');

  const invoice = await subscriptionService.getInvoice(user!.id, invoiceId);
  if (!invoice) {
    return c.json({ error: 'Invoice not found' }, 404);
  }

  return c.json({ invoice });
});

// Get billing portal URL
subscriptionsRouter.get('/billing-portal', requireAuth, async (c) => {
  const user = getCurrentUser(c);

  try {
    const url = await subscriptionService.getBillingPortalUrl(user!.id);
    return c.json({ url });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Webhook endpoint for payment processor
subscriptionsRouter.post('/webhook', async (c) => {
  // In production, verify webhook signature
  const body = await c.req.json();

  const { type, data } = body;

  switch (type) {
    case 'payment_intent.succeeded':
      await subscriptionService.processPayment(
        data.subscription_id,
        data.payment_intent_id,
        'succeeded'
      );
      break;

    case 'payment_intent.failed':
      await subscriptionService.processPayment(
        data.subscription_id,
        data.payment_intent_id,
        'failed'
      );
      break;

    default:
      // Log unknown event type
      break;
  }

  return c.json({ received: true });
});

export { subscriptionsRouter };
