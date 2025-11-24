// Subscription & Membership Service
// Handle premium subscriptions, membership tiers, and billing

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';
import { emailService } from './email.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';

// Membership tiers
export type MembershipTier = 'free' | 'basic' | 'pro' | 'enterprise';

interface TierConfig {
  name: string;
  price: number;
  priceYearly: number;
  features: string[];
  limits: {
    articlesPerMonth: number;
    storageGB: number;
    customDomain: boolean;
    analytics: 'basic' | 'advanced' | 'full';
    prioritySupport: boolean;
    apiAccess: boolean;
    teamMembers: number;
    scheduledPosts: number;
    removeAds: boolean;
    newsletterSubscribers: number;
  };
}

const TIER_CONFIGS: Record<MembershipTier, TierConfig> = {
  free: {
    name: 'Free',
    price: 0,
    priceYearly: 0,
    features: ['Basic publishing', 'Community access', 'Basic analytics'],
    limits: {
      articlesPerMonth: 5,
      storageGB: 1,
      customDomain: false,
      analytics: 'basic',
      prioritySupport: false,
      apiAccess: false,
      teamMembers: 1,
      scheduledPosts: 2,
      removeAds: false,
      newsletterSubscribers: 100,
    },
  },
  basic: {
    name: 'Basic',
    price: 9.99,
    priceYearly: 99.99,
    features: ['Unlimited publishing', 'Advanced analytics', 'Custom branding', 'Newsletter up to 1K'],
    limits: {
      articlesPerMonth: -1,
      storageGB: 10,
      customDomain: false,
      analytics: 'advanced',
      prioritySupport: false,
      apiAccess: true,
      teamMembers: 2,
      scheduledPosts: 20,
      removeAds: true,
      newsletterSubscribers: 1000,
    },
  },
  pro: {
    name: 'Pro',
    price: 29.99,
    priceYearly: 299.99,
    features: ['Everything in Basic', 'Custom domain', 'Priority support', 'Newsletter up to 10K', 'Team collaboration'],
    limits: {
      articlesPerMonth: -1,
      storageGB: 50,
      customDomain: true,
      analytics: 'full',
      prioritySupport: true,
      apiAccess: true,
      teamMembers: 5,
      scheduledPosts: -1,
      removeAds: true,
      newsletterSubscribers: 10000,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 99.99,
    priceYearly: 999.99,
    features: ['Everything in Pro', 'Unlimited team members', 'SLA guarantee', 'Dedicated support', 'Custom integrations'],
    limits: {
      articlesPerMonth: -1,
      storageGB: 500,
      customDomain: true,
      analytics: 'full',
      prioritySupport: true,
      apiAccess: true,
      teamMembers: -1,
      scheduledPosts: -1,
      removeAds: true,
      newsletterSubscribers: -1,
    },
  },
};

interface Subscription {
  id: string;
  userId: string;
  tier: MembershipTier;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  paymentMethod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UsageStats {
  articlesThisMonth: number;
  storageUsedGB: number;
  teamMembersCount: number;
  scheduledPostsCount: number;
  newsletterSubscribersCount: number;
}

interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoiceDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  invoiceUrl: string | null;
}

// In-memory storage for demo (would be database tables in production)
const subscriptions = new Map<string, Subscription>();
const invoices = new Map<string, Invoice[]>();
const usageTracking = new Map<string, UsageStats>();

export const subscriptionService = {
  // Get tier configuration
  getTierConfig(tier: MembershipTier): TierConfig {
    return TIER_CONFIGS[tier];
  },

  // Get all tier configurations
  getAllTiers(): Record<MembershipTier, TierConfig> {
    return TIER_CONFIGS;
  },

  // Get user's current subscription
  async getSubscription(userId: string): Promise<Subscription | null> {
    const cacheKey = `subscription:${userId}`;
    const cached = await cacheService.get<Subscription>(cacheKey);
    if (cached) return cached;

    // Check in-memory storage (would be DB query in production)
    let subscription = subscriptions.get(userId);

    if (!subscription) {
      // Create default free subscription
      subscription = {
        id: `sub_${Date.now()}_${userId.slice(0, 8)}`,
        userId,
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        trialEnd: null,
        paymentMethod: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      subscriptions.set(userId, subscription);
    }

    await cacheService.set(cacheKey, subscription, CACHE_TTL.USER_PROFILE);
    return subscription;
  },

  // Create or upgrade subscription
  async createSubscription(
    userId: string,
    tier: MembershipTier,
    billingCycle: 'monthly' | 'yearly',
    paymentMethodId?: string
  ): Promise<{ subscription: Subscription; clientSecret?: string }> {
    const config = TIER_CONFIGS[tier];

    // Create subscription record
    const subscription: Subscription = {
      id: `sub_${Date.now()}_${userId.slice(0, 8)}`,
      userId,
      tier,
      status: tier === 'free' ? 'active' : 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(
        Date.now() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
      ),
      cancelAtPeriodEnd: false,
      trialEnd: tier !== 'free' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
      paymentMethod: paymentMethodId || null,
      stripeCustomerId: `cus_${Date.now()}`,
      stripeSubscriptionId: tier !== 'free' ? `stripe_sub_${Date.now()}` : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    subscriptions.set(userId, subscription);
    await cacheService.delete(`subscription:${userId}`);

    // Create initial invoice
    if (tier !== 'free') {
      const invoice: Invoice = {
        id: `inv_${Date.now()}`,
        subscriptionId: subscription.id,
        amount: billingCycle === 'yearly' ? config.priceYearly : config.price,
        currency: 'usd',
        status: 'open',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        paidAt: null,
        invoiceUrl: null,
      };

      const userInvoices = invoices.get(userId) || [];
      userInvoices.push(invoice);
      invoices.set(userId, userInvoices);
    }

    // Audit log
    await auditService.log({
      userId,
      action: 'user:settings_update',
      entityType: 'user',
      entityId: userId,
      metadata: { action: 'subscription_created', tier, billingCycle },
    });

    // Send welcome email
    const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
    if (user) {
      await emailService.send({
        to: user.email,
        subject: `Welcome to ${config.name} Plan!`,
        html: `
          <h1>Welcome to ${config.name}!</h1>
          <p>Hi ${user.name},</p>
          <p>Your subscription has been activated. Here's what you get:</p>
          <ul>
            ${config.features.map((f) => `<li>${f}</li>`).join('')}
          </ul>
          <p>Thank you for your support!</p>
        `,
      });
    }

    logger.info({ userId, tier, billingCycle }, 'Subscription created');

    return { subscription };
  },

  // Upgrade subscription
  async upgradeSubscription(
    userId: string,
    newTier: MembershipTier
  ): Promise<Subscription> {
    const current = await this.getSubscription(userId);
    if (!current) {
      throw new Error('No subscription found');
    }

    const tierOrder: MembershipTier[] = ['free', 'basic', 'pro', 'enterprise'];
    const currentIndex = tierOrder.indexOf(current.tier);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to a higher tier');
    }

    current.tier = newTier;
    current.updatedAt = new Date();
    subscriptions.set(userId, current);
    await cacheService.delete(`subscription:${userId}`);

    // Notify user
    await notificationService.create({
      userId,
      type: 'mention',
      title: 'Subscription Upgraded',
      message: `Your subscription has been upgraded to ${TIER_CONFIGS[newTier].name}!`,
    });

    logger.info({ userId, oldTier: current.tier, newTier }, 'Subscription upgraded');

    return current;
  },

  // Cancel subscription
  async cancelSubscription(
    userId: string,
    cancelImmediately = false
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      throw new Error('No subscription found');
    }

    if (cancelImmediately) {
      subscription.status = 'canceled';
      subscription.tier = 'free';
    } else {
      subscription.cancelAtPeriodEnd = true;
    }

    subscription.updatedAt = new Date();
    subscriptions.set(userId, subscription);
    await cacheService.delete(`subscription:${userId}`);

    // Audit log
    await auditService.log({
      userId,
      action: 'user:settings_update',
      entityType: 'user',
      entityId: userId,
      metadata: { action: 'subscription_canceled', cancelImmediately },
    });

    logger.info({ userId, cancelImmediately }, 'Subscription canceled');

    return subscription;
  },

  // Resume canceled subscription
  async resumeSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      throw new Error('No subscription found');
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new Error('Subscription is not set to cancel');
    }

    subscription.cancelAtPeriodEnd = false;
    subscription.updatedAt = new Date();
    subscriptions.set(userId, subscription);
    await cacheService.delete(`subscription:${userId}`);

    logger.info({ userId }, 'Subscription resumed');

    return subscription;
  },

  // Check feature access
  async hasFeatureAccess(
    userId: string,
    feature: keyof TierConfig['limits']
  ): Promise<boolean> {
    const subscription = await this.getSubscription(userId);
    if (!subscription || subscription.status !== 'active') {
      return false;
    }

    const config = TIER_CONFIGS[subscription.tier];
    const limit = config.limits[feature];

    if (typeof limit === 'boolean') {
      return limit;
    }

    return limit !== 0;
  },

  // Check if user can perform action within limits
  async checkLimit(
    userId: string,
    limitType: keyof TierConfig['limits'],
    currentUsage: number
  ): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
    const subscription = await this.getSubscription(userId);
    const tier = subscription?.tier || 'free';
    const config = TIER_CONFIGS[tier];
    const limit = config.limits[limitType] as number;

    if (limit === -1) {
      return { allowed: true, limit: -1, used: currentUsage, remaining: -1 };
    }

    const allowed = currentUsage < limit;
    return {
      allowed,
      limit,
      used: currentUsage,
      remaining: Math.max(0, limit - currentUsage),
    };
  },

  // Get usage statistics
  async getUsageStats(userId: string): Promise<UsageStats> {
    // In production, this would aggregate from various tables
    const stats = usageTracking.get(userId) || {
      articlesThisMonth: 0,
      storageUsedGB: 0,
      teamMembersCount: 1,
      scheduledPostsCount: 0,
      newsletterSubscribersCount: 0,
    };

    return stats;
  },

  // Track usage
  async trackUsage(
    userId: string,
    metric: keyof UsageStats,
    increment: number
  ): Promise<void> {
    const stats = await this.getUsageStats(userId);
    (stats[metric] as number) += increment;
    usageTracking.set(userId, stats);
  },

  // Get invoices
  async getInvoices(userId: string): Promise<Invoice[]> {
    return invoices.get(userId) || [];
  },

  // Get invoice by ID
  async getInvoice(userId: string, invoiceId: string): Promise<Invoice | null> {
    const userInvoices = invoices.get(userId) || [];
    return userInvoices.find((i) => i.id === invoiceId) || null;
  },

  // Process payment (webhook handler)
  async processPayment(
    subscriptionId: string,
    _paymentIntentId: string,
    status: 'succeeded' | 'failed'
  ): Promise<void> {
    // Find subscription
    let userId: string | null = null;
    for (const [uid, sub] of subscriptions.entries()) {
      if (sub.id === subscriptionId) {
        userId = uid;
        break;
      }
    }

    if (!userId) {
      logger.error({ subscriptionId }, 'Subscription not found for payment');
      return;
    }

    const subscription = subscriptions.get(userId)!;

    if (status === 'succeeded') {
      subscription.status = 'active';
      subscription.trialEnd = null;

      // Update invoice
      const userInvoices = invoices.get(userId) || [];
      const latestInvoice = userInvoices[userInvoices.length - 1];
      if (latestInvoice) {
        latestInvoice.status = 'paid';
        latestInvoice.paidAt = new Date();
      }

      await notificationService.create({
        userId,
        type: 'mention',
        title: 'Payment Successful',
        message: 'Your payment has been processed successfully.',
      });
    } else {
      subscription.status = 'past_due';

      await notificationService.create({
        userId,
        type: 'mention',
        title: 'Payment Failed',
        message: 'Your payment could not be processed. Please update your payment method.',
      });
    }

    subscription.updatedAt = new Date();
    subscriptions.set(userId, subscription);
    await cacheService.delete(`subscription:${userId}`);

    logger.info({ userId, subscriptionId, status }, 'Payment processed');
  },

  // Apply promo code
  async applyPromoCode(
    userId: string,
    code: string
  ): Promise<{ success: boolean; discount: number; message: string }> {
    // Demo promo codes
    const promoCodes: Record<string, { discount: number; validTiers: MembershipTier[] }> = {
      'WELCOME20': { discount: 0.2, validTiers: ['basic', 'pro'] },
      'LAUNCH50': { discount: 0.5, validTiers: ['basic', 'pro', 'enterprise'] },
      'YEARLY25': { discount: 0.25, validTiers: ['basic', 'pro', 'enterprise'] },
    };

    const promo = promoCodes[code.toUpperCase()];
    if (!promo) {
      return { success: false, discount: 0, message: 'Invalid promo code' };
    }

    logger.info({ userId, code, discount: promo.discount }, 'Promo code applied');

    return {
      success: true,
      discount: promo.discount,
      message: `${promo.discount * 100}% discount applied!`,
    };
  },

  // Get billing portal URL
  async getBillingPortalUrl(userId: string): Promise<string> {
    const subscription = await this.getSubscription(userId);
    if (!subscription?.stripeCustomerId) {
      throw new Error('No billing account found');
    }

    // In production, this would create a Stripe billing portal session
    return `https://billing.pythoughts.com/portal/${subscription.stripeCustomerId}`;
  },

  // Check if subscription is active
  async isSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await this.getSubscription(userId);
    return subscription?.status === 'active' || subscription?.status === 'trialing';
  },

  // Get subscription summary for display
  async getSubscriptionSummary(userId: string): Promise<{
    tier: MembershipTier;
    tierName: string;
    status: string;
    features: string[];
    limits: TierConfig['limits'];
    usage: UsageStats;
    renewalDate: Date | null;
    price: number;
  }> {
    const subscription = await this.getSubscription(userId);
    const tier = subscription?.tier || 'free';
    const config = TIER_CONFIGS[tier];
    const usage = await this.getUsageStats(userId);

    return {
      tier,
      tierName: config.name,
      status: subscription?.status || 'active',
      features: config.features,
      limits: config.limits,
      usage,
      renewalDate: subscription?.cancelAtPeriodEnd ? null : subscription?.currentPeriodEnd || null,
      price: config.price,
    };
  },
};
