// Newsletter Service
// Manage author newsletters, subscribers, and campaigns

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { emailService } from './email.service.js';
import { subscriptionService } from './subscription.service.js';
import Handlebars from 'handlebars';

interface NewsletterSubscriber {
  id: string;
  email: string;
  name: string | null;
  authorId: string;
  status: 'active' | 'unsubscribed' | 'bounced';
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
  source: 'website' | 'import' | 'api';
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface NewsletterCampaign {
  id: string;
  authorId: string;
  name: string;
  subject: string;
  previewText: string;
  content: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt: Date | null;
  sentAt: Date | null;
  articleId: string | null;
  recipientCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

// In-memory storage (would be database tables in production)
const subscribers = new Map<string, NewsletterSubscriber[]>();
const campaigns = new Map<string, NewsletterCampaign[]>();

// Email templates
const defaultTemplate = Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
    .content { padding: 20px 0; }
    .article-card { background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .article-title { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
    .article-title a { color: #2C3E50; text-decoration: none; }
    .article-excerpt { color: #666; }
    .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; padding: 20px 0; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{authorName}}</h1>
    {{#if previewText}}<p>{{previewText}}</p>{{/if}}
  </div>

  <div class="content">
    {{{content}}}

    {{#if article}}
    <div class="article-card">
      <div class="article-title">
        <a href="{{article.url}}">{{article.title}}</a>
      </div>
      {{#if article.excerpt}}
      <p class="article-excerpt">{{article.excerpt}}</p>
      {{/if}}
      <a href="{{article.url}}" class="button">Read More</a>
    </div>
    {{/if}}
  </div>

  <div class="footer">
    <p>You're receiving this because you subscribed to {{authorName}}'s newsletter.</p>
    <p><a href="{{unsubscribeUrl}}">Unsubscribe</a> | <a href="{{preferencesUrl}}">Manage preferences</a></p>
  </div>
</body>
</html>
`);

export const newsletterService = {
  // Add subscriber
  async addSubscriber(
    authorId: string,
    email: string,
    name?: string,
    source: 'website' | 'import' | 'api' = 'website',
    tags: string[] = []
  ): Promise<{ success: boolean; subscriber?: NewsletterSubscriber; error?: string }> {
    // Check subscription limits
    const authorSubs = subscribers.get(authorId) || [];
    const limitCheck = await subscriptionService.checkLimit(
      authorId,
      'newsletterSubscribers',
      authorSubs.filter((s) => s.status === 'active').length
    );

    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Subscriber limit reached (${limitCheck.limit}). Upgrade to add more subscribers.`,
      };
    }

    // Check if already subscribed
    const existing = authorSubs.find(
      (s) => s.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      if (existing.status === 'unsubscribed') {
        existing.status = 'active';
        existing.unsubscribedAt = null;
        return { success: true, subscriber: existing };
      }
      return { success: false, error: 'Email already subscribed' };
    }

    const subscriber: NewsletterSubscriber = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: email.toLowerCase(),
      name: name || null,
      authorId,
      status: 'active',
      confirmedAt: source === 'website' ? null : new Date(), // Require confirmation for website signups
      unsubscribedAt: null,
      source,
      tags,
      metadata: {},
      createdAt: new Date(),
    };

    authorSubs.push(subscriber);
    subscribers.set(authorId, authorSubs);

    // Send confirmation email for website signups
    if (source === 'website') {
      await this.sendConfirmationEmail(authorId, subscriber);
    }

    logger.info({ authorId, email, source }, 'Newsletter subscriber added');

    return { success: true, subscriber };
  },

  // Send confirmation email
  async sendConfirmationEmail(
    authorId: string,
    subscriber: NewsletterSubscriber
  ): Promise<void> {
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, authorId));

    const confirmUrl = `${process.env.APP_URL || 'http://localhost:3000'}/newsletter/confirm/${subscriber.id}`;

    await emailService.send({
      to: subscriber.email,
      subject: `Confirm your subscription to ${author?.name || 'Newsletter'}`,
      html: `
        <h1>Please confirm your subscription</h1>
        <p>Hi${subscriber.name ? ` ${subscriber.name}` : ''},</p>
        <p>Thank you for subscribing to ${author?.name || 'our'} newsletter!</p>
        <p>Please click the button below to confirm your subscription:</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#2C3E50;color:white;text-decoration:none;border-radius:6px;">Confirm Subscription</a></p>
        <p>If you didn't subscribe, you can safely ignore this email.</p>
      `,
    });
  },

  // Confirm subscriber
  async confirmSubscriber(subscriberId: string): Promise<boolean> {
    for (const [authorId, authorSubs] of subscribers.entries()) {
      const subscriber = authorSubs.find((s) => s.id === subscriberId);
      if (subscriber) {
        subscriber.confirmedAt = new Date();
        subscriber.status = 'active';
        logger.info({ authorId, subscriberId }, 'Subscriber confirmed');
        return true;
      }
    }
    return false;
  },

  // Unsubscribe
  async unsubscribe(
    authorId: string,
    email: string
  ): Promise<boolean> {
    const authorSubs = subscribers.get(authorId) || [];
    const subscriber = authorSubs.find(
      (s) => s.email.toLowerCase() === email.toLowerCase()
    );

    if (!subscriber) {
      return false;
    }

    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();

    logger.info({ authorId, email }, 'Subscriber unsubscribed');

    return true;
  },

  // Get subscribers for author
  async getSubscribers(
    authorId: string,
    options: {
      status?: 'active' | 'unsubscribed' | 'bounced';
      tag?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ subscribers: NewsletterSubscriber[]; total: number }> {
    const { status, tag, page = 1, limit = 50 } = options;
    let authorSubs = subscribers.get(authorId) || [];

    if (status) {
      authorSubs = authorSubs.filter((s) => s.status === status);
    }

    if (tag) {
      authorSubs = authorSubs.filter((s) => s.tags.includes(tag));
    }

    const total = authorSubs.length;
    const offset = (page - 1) * limit;
    const paginatedSubs = authorSubs.slice(offset, offset + limit);

    return { subscribers: paginatedSubs, total };
  },

  // Get subscriber count
  async getSubscriberCount(authorId: string): Promise<{
    total: number;
    active: number;
    unsubscribed: number;
    bounced: number;
  }> {
    const authorSubs = subscribers.get(authorId) || [];

    return {
      total: authorSubs.length,
      active: authorSubs.filter((s) => s.status === 'active').length,
      unsubscribed: authorSubs.filter((s) => s.status === 'unsubscribed').length,
      bounced: authorSubs.filter((s) => s.status === 'bounced').length,
    };
  },

  // Import subscribers from CSV
  async importSubscribers(
    authorId: string,
    csvData: string
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const results = { imported: 0, skipped: 0, errors: [] as string[] };
    const lines = csvData.split('\n').filter((line) => line.trim());

    // Skip header row if present
    const startIndex = lines[0]?.toLowerCase().includes('email') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const [email, name, ...tags] = lines[i].split(',').map((s) => s.trim());

      if (!email || !email.includes('@')) {
        results.errors.push(`Line ${i + 1}: Invalid email`);
        continue;
      }

      const result = await this.addSubscriber(
        authorId,
        email,
        name || undefined,
        'import',
        tags.filter(Boolean)
      );

      if (result.success) {
        results.imported++;
      } else {
        results.skipped++;
        if (result.error !== 'Email already subscribed') {
          results.errors.push(`Line ${i + 1}: ${result.error}`);
        }
      }
    }

    logger.info({ authorId, results }, 'Newsletter import completed');

    return results;
  },

  // Export subscribers to CSV
  async exportSubscribers(authorId: string): Promise<string> {
    const authorSubs = subscribers.get(authorId) || [];

    let csv = 'email,name,status,tags,subscribed_at\n';

    for (const sub of authorSubs) {
      csv += `${sub.email},${sub.name || ''},${sub.status},"${sub.tags.join(';')}",${sub.createdAt.toISOString()}\n`;
    }

    return csv;
  },

  // Create campaign
  async createCampaign(
    authorId: string,
    data: {
      name: string;
      subject: string;
      previewText?: string;
      content: string;
      articleId?: string;
      scheduledAt?: Date;
    }
  ): Promise<NewsletterCampaign> {
    const campaign: NewsletterCampaign = {
      id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      authorId,
      name: data.name,
      subject: data.subject,
      previewText: data.previewText || '',
      content: data.content,
      status: data.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: data.scheduledAt || null,
      sentAt: null,
      articleId: data.articleId || null,
      recipientCount: 0,
      openCount: 0,
      clickCount: 0,
      bounceCount: 0,
      unsubscribeCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const authorCampaigns = campaigns.get(authorId) || [];
    authorCampaigns.push(campaign);
    campaigns.set(authorId, authorCampaigns);

    logger.info({ authorId, campaignId: campaign.id }, 'Campaign created');

    return campaign;
  },

  // Update campaign
  async updateCampaign(
    authorId: string,
    campaignId: string,
    updates: Partial<Pick<NewsletterCampaign, 'name' | 'subject' | 'previewText' | 'content' | 'articleId' | 'scheduledAt'>>
  ): Promise<NewsletterCampaign | null> {
    const authorCampaigns = campaigns.get(authorId) || [];
    const campaign = authorCampaigns.find((c) => c.id === campaignId);

    if (!campaign || campaign.status === 'sent') {
      return null;
    }

    Object.assign(campaign, updates, { updatedAt: new Date() });

    if (updates.scheduledAt && campaign.status === 'draft') {
      campaign.status = 'scheduled';
    }

    return campaign;
  },

  // Delete campaign
  async deleteCampaign(authorId: string, campaignId: string): Promise<boolean> {
    const authorCampaigns = campaigns.get(authorId) || [];
    const index = authorCampaigns.findIndex((c) => c.id === campaignId);

    if (index === -1) {
      return false;
    }

    const campaign = authorCampaigns[index];
    if (campaign.status === 'sending' || campaign.status === 'sent') {
      return false;
    }

    authorCampaigns.splice(index, 1);
    campaigns.set(authorId, authorCampaigns);

    return true;
  },

  // Send campaign
  async sendCampaign(
    authorId: string,
    campaignId: string
  ): Promise<{ success: boolean; error?: string }> {
    const authorCampaigns = campaigns.get(authorId) || [];
    const campaign = authorCampaigns.find((c) => c.id === campaignId);

    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return { success: false, error: 'Campaign already sent or sending' };
    }

    const authorSubs = (subscribers.get(authorId) || []).filter(
      (s) => s.status === 'active' && s.confirmedAt
    );

    if (authorSubs.length === 0) {
      return { success: false, error: 'No active subscribers' };
    }

    campaign.status = 'sending';
    campaign.recipientCount = authorSubs.length;

    // Get author info
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, authorId));

    // Get article if linked
    let article: { title: string; excerpt: string | null; url: string } | null = null;
    if (campaign.articleId) {
      const [draft] = await db
        .select({ title: drafts.title, excerpt: drafts.excerpt, slug: drafts.slug })
        .from(drafts)
        .where(eq(drafts.id, campaign.articleId));

      if (draft) {
        article = {
          title: draft.title,
          excerpt: draft.excerpt,
          url: `${process.env.APP_URL || 'http://localhost:3000'}/article/${draft.slug || campaign.articleId}`,
        };
      }
    }

    // Send emails in batches
    const batchSize = 50;
    let sentCount = 0;

    for (let i = 0; i < authorSubs.length; i += batchSize) {
      const batch = authorSubs.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (subscriber) => {
          const unsubscribeUrl = `${process.env.APP_URL || 'http://localhost:3000'}/newsletter/unsubscribe/${subscriber.id}`;
          const preferencesUrl = `${process.env.APP_URL || 'http://localhost:3000'}/newsletter/preferences/${subscriber.id}`;

          const html = defaultTemplate({
            authorName: author?.name || 'Newsletter',
            previewText: campaign.previewText,
            content: campaign.content,
            article,
            unsubscribeUrl,
            preferencesUrl,
          });

          try {
            await emailService.send({
              to: subscriber.email,
              subject: campaign.subject,
              html,
            });
            sentCount++;
          } catch (error) {
            logger.error({ error, email: subscriber.email }, 'Failed to send newsletter');
          }
        })
      );

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    campaign.status = 'sent';
    campaign.sentAt = new Date();

    logger.info({ authorId, campaignId, sentCount }, 'Campaign sent');

    return { success: true };
  },

  // Get campaigns for author
  async getCampaigns(
    authorId: string,
    options: {
      status?: NewsletterCampaign['status'];
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ campaigns: NewsletterCampaign[]; total: number }> {
    const { status, page = 1, limit = 20 } = options;
    let authorCampaigns = campaigns.get(authorId) || [];

    if (status) {
      authorCampaigns = authorCampaigns.filter((c) => c.status === status);
    }

    // Sort by creation date descending
    authorCampaigns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = authorCampaigns.length;
    const offset = (page - 1) * limit;
    const paginatedCampaigns = authorCampaigns.slice(offset, offset + limit);

    return { campaigns: paginatedCampaigns, total };
  },

  // Get campaign by ID
  async getCampaign(authorId: string, campaignId: string): Promise<NewsletterCampaign | null> {
    const authorCampaigns = campaigns.get(authorId) || [];
    return authorCampaigns.find((c) => c.id === campaignId) || null;
  },

  // Get campaign stats
  async getCampaignStats(
    authorId: string,
    campaignId: string
  ): Promise<CampaignStats | null> {
    const campaign = await this.getCampaign(authorId, campaignId);
    if (!campaign) {
      return null;
    }

    const delivered = campaign.recipientCount - campaign.bounceCount;
    const openRate = delivered > 0 ? (campaign.openCount / delivered) * 100 : 0;
    const clickRate = campaign.openCount > 0 ? (campaign.clickCount / campaign.openCount) * 100 : 0;

    return {
      sent: campaign.recipientCount,
      delivered,
      opened: campaign.openCount,
      clicked: campaign.clickCount,
      bounced: campaign.bounceCount,
      unsubscribed: campaign.unsubscribeCount,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
    };
  },

  // Track open
  async trackOpen(campaignId: string, _subscriberId: string): Promise<void> {
    for (const [_authorId, authorCampaigns] of campaigns.entries()) {
      const campaign = authorCampaigns.find((c) => c.id === campaignId);
      if (campaign) {
        campaign.openCount++;
        break;
      }
    }
  },

  // Track click
  async trackClick(campaignId: string, _subscriberId: string, _url: string): Promise<void> {
    for (const [_authorId, authorCampaigns] of campaigns.entries()) {
      const campaign = authorCampaigns.find((c) => c.id === campaignId);
      if (campaign) {
        campaign.clickCount++;
        break;
      }
    }
  },

  // Get newsletter analytics
  async getNewsletterAnalytics(authorId: string): Promise<{
    totalSubscribers: number;
    subscriberGrowth: number;
    totalCampaignsSent: number;
    avgOpenRate: number;
    avgClickRate: number;
  }> {
    const { active } = await this.getSubscriberCount(authorId);
    const authorCampaigns = (campaigns.get(authorId) || []).filter(
      (c) => c.status === 'sent'
    );

    let totalOpenRate = 0;
    let totalClickRate = 0;

    for (const campaign of authorCampaigns) {
      const stats = await this.getCampaignStats(authorId, campaign.id);
      if (stats) {
        totalOpenRate += stats.openRate;
        totalClickRate += stats.clickRate;
      }
    }

    const sentCount = authorCampaigns.length;

    return {
      totalSubscribers: active,
      subscriberGrowth: 0, // Would calculate based on historical data
      totalCampaignsSent: sentCount,
      avgOpenRate: sentCount > 0 ? Math.round((totalOpenRate / sentCount) * 100) / 100 : 0,
      avgClickRate: sentCount > 0 ? Math.round((totalClickRate / sentCount) * 100) / 100 : 0,
    };
  },

  // Schedule campaign check (called by scheduler)
  async processScheduledCampaigns(): Promise<number> {
    let processed = 0;
    const now = new Date();

    for (const [authorId, authorCampaigns] of campaigns.entries()) {
      for (const campaign of authorCampaigns) {
        if (
          campaign.status === 'scheduled' &&
          campaign.scheduledAt &&
          campaign.scheduledAt <= now
        ) {
          await this.sendCampaign(authorId, campaign.id);
          processed++;
        }
      }
    }

    return processed;
  },
};
