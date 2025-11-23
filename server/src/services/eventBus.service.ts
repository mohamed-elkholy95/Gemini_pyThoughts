// Event Bus Service
// Provides pub/sub messaging for decoupled communication between services

import { EventEmitter } from 'events';
import { cacheService } from './cache.service.js';
import { logger } from '../config/logger.js';

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

export interface EventMessage<T = unknown> {
  id: string;
  type: string;
  data: T;
  timestamp: Date;
  source: string;
  priority: EventPriority;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  filter?: EventFilter;
  priority: EventPriority;
  once: boolean;
}

export type EventHandler<T = unknown> = (event: EventMessage<T>) => Promise<void> | void;
export type EventFilter<T = unknown> = (event: EventMessage<T>) => boolean;

interface SubscriptionOptions {
  filter?: EventFilter;
  priority?: EventPriority;
  once?: boolean;
}

const CHANNEL_PREFIX = 'pythoughts:events:';
const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

class EventBus extends EventEmitter {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private subscriber: ReturnType<typeof cacheService.getClient> = null;
  private isRedisConnected = false;
  private pendingEvents: EventMessage[] = [];
  private processingEvents = false;
  private instanceId: string;

  constructor() {
    super();
    this.instanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.setMaxListeners(100);
  }

  // Initialize Redis pub/sub
  async init(): Promise<void> {
    const redis = cacheService.getClient();
    if (!redis) {
      logger.warn('Redis not available, using local event bus only');
      return;
    }

    try {
      // Create a dedicated subscriber connection
      this.subscriber = redis.duplicate();
      await this.subscriber.connect();

      this.subscriber.on('message', (channel: string, message: string) => {
        this.handleRedisMessage(channel, message);
      });

      this.isRedisConnected = true;
      logger.info('Event bus Redis connection established');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis event bus');
    }
  }

  // Publish an event
  async publish<T>(
    eventType: string,
    data: T,
    options: {
      priority?: EventPriority;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const event: EventMessage<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      data,
      timestamp: new Date(),
      source: this.instanceId,
      priority: options.priority || 'normal',
      correlationId: options.correlationId,
      metadata: options.metadata,
    };

    // Publish to Redis if available
    if (this.isRedisConnected) {
      const redis = cacheService.getClient();
      if (redis) {
        try {
          await redis.publish(`${CHANNEL_PREFIX}${eventType}`, JSON.stringify(event));
        } catch (error) {
          logger.error({ eventType, error }, 'Failed to publish to Redis');
        }
      }
    }

    // Also emit locally for same-instance subscribers
    await this.emitEvent(event);

    logger.debug({ eventId: event.id, type: eventType }, 'Event published');
    return event.id;
  }

  // Subscribe to an event type
  subscribe<T>(
    eventType: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): string {
    const subscription: EventSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      eventType,
      handler: handler as EventHandler,
      filter: options.filter as EventFilter | undefined,
      priority: options.priority || 'normal',
      once: options.once || false,
    };

    // Add to local subscriptions
    const subs = this.subscriptions.get(eventType) || [];
    subs.push(subscription);
    // Sort by priority
    subs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    this.subscriptions.set(eventType, subs);

    // Subscribe to Redis channel
    if (this.isRedisConnected && this.subscriber) {
      this.subscriber.subscribe(`${CHANNEL_PREFIX}${eventType}`).catch((error: Error) => {
        logger.error({ eventType, error }, 'Failed to subscribe to Redis channel');
      });
    }

    logger.debug({ subscriptionId: subscription.id, eventType }, 'Event subscription created');
    return subscription.id;
  }

  // Subscribe to an event once
  subscribeOnce<T>(eventType: string, handler: EventHandler<T>, options?: Omit<SubscriptionOptions, 'once'>): string {
    return this.subscribe(eventType, handler, { ...options, once: true });
  }

  // Unsubscribe from an event
  unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subs] of this.subscriptions) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);

        // Unsubscribe from Redis if no more local subscribers
        if (subs.length === 0 && this.isRedisConnected && this.subscriber) {
          this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${eventType}`).catch((error: Error) => {
            logger.error({ eventType, error }, 'Failed to unsubscribe from Redis channel');
          });
          this.subscriptions.delete(eventType);
        }

        logger.debug({ subscriptionId }, 'Event subscription removed');
        return true;
      }
    }
    return false;
  }

  // Unsubscribe all handlers for an event type
  unsubscribeAll(eventType: string): void {
    this.subscriptions.delete(eventType);

    if (this.isRedisConnected && this.subscriber) {
      this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${eventType}`).catch((error: Error) => {
        logger.error({ eventType, error }, 'Failed to unsubscribe from Redis channel');
      });
    }
  }

  // Handle Redis message
  private handleRedisMessage(channel: string, message: string): void {
    try {
      const event = JSON.parse(message) as EventMessage;

      // Skip events from this instance (already processed locally)
      if (event.source === this.instanceId) {
        return;
      }

      this.emitEvent(event);
    } catch (error) {
      logger.error({ channel, error }, 'Failed to process Redis message');
    }
  }

  // Emit event to local subscribers
  private async emitEvent(event: EventMessage): Promise<void> {
    this.pendingEvents.push(event);
    await this.processEvents();
  }

  // Process pending events
  private async processEvents(): Promise<void> {
    if (this.processingEvents) return;
    this.processingEvents = true;

    try {
      while (this.pendingEvents.length > 0) {
        // Sort by priority
        this.pendingEvents.sort(
          (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        );

        const event = this.pendingEvents.shift()!;
        const subs = this.subscriptions.get(event.type) || [];
        const toRemove: string[] = [];

        for (const sub of subs) {
          try {
            // Apply filter if present
            if (sub.filter && !sub.filter(event)) {
              continue;
            }

            await sub.handler(event);

            if (sub.once) {
              toRemove.push(sub.id);
            }
          } catch (error) {
            logger.error(
              { eventId: event.id, subscriptionId: sub.id, error },
              'Event handler error'
            );
          }
        }

        // Remove one-time subscriptions
        for (const id of toRemove) {
          this.unsubscribe(id);
        }

        // Emit on EventEmitter for additional listeners
        this.emit(event.type, event);
      }
    } finally {
      this.processingEvents = false;
    }
  }

  // Get subscription count for an event type
  getSubscriptionCount(eventType: string): number {
    return this.subscriptions.get(eventType)?.length || 0;
  }

  // Get all event types with subscriptions
  getEventTypes(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // Check if connected to Redis
  isConnected(): boolean {
    return this.isRedisConnected;
  }

  // Shutdown the event bus
  async shutdown(): Promise<void> {
    // Wait for pending events to process
    while (this.pendingEvents.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    this.subscriptions.clear();
    this.isRedisConnected = false;
    this.removeAllListeners();

    logger.info('Event bus shutdown complete');
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Pre-defined event types
export const EventTypes = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Article events
  ARTICLE_PUBLISHED: 'article.published',
  ARTICLE_UPDATED: 'article.updated',
  ARTICLE_DELETED: 'article.deleted',
  ARTICLE_VIEWED: 'article.viewed',

  // Comment events
  COMMENT_CREATED: 'comment.created',
  COMMENT_DELETED: 'comment.deleted',

  // Social events
  USER_FOLLOWED: 'user.followed',
  USER_UNFOLLOWED: 'user.unfollowed',
  ARTICLE_LIKED: 'article.liked',
  ARTICLE_BOOKMARKED: 'article.bookmarked',

  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  CACHE_INVALIDATED: 'cache.invalidated',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
