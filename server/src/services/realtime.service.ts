// Real-time Service using Server-Sent Events (SSE)
// Provides real-time notifications and feed updates

import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

interface SSEClient {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: Date;
  lastHeartbeat: Date;
}

interface RealtimeEvent {
  type: 'notification' | 'feed_update' | 'typing' | 'presence';
  data: unknown;
  targetUserIds?: string[];
}

class RealtimeService extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private userClients: Map<string, Set<string>> = new Map(); // userId -> clientIds
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // Start heartbeat monitoring
  start(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
      this.cleanupStaleConnections();
    }, 30000); // 30 seconds

    logger.info('Realtime service started');
  }

  // Stop the service
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    for (const client of this.clients.values()) {
      try {
        client.controller.close();
      } catch {
        // Ignore errors on close
      }
    }

    this.clients.clear();
    this.userClients.clear();
    logger.info('Realtime service stopped');
  }

  // Register a new SSE client
  registerClient(
    clientId: string,
    userId: string,
    controller: ReadableStreamDefaultController
  ): void {
    const client: SSEClient = {
      id: clientId,
      userId,
      controller,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.clients.set(clientId, client);

    // Track by user
    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(clientId);

    logger.debug({ clientId, userId }, 'SSE client registered');
    this.emit('client:connected', { clientId, userId });
  }

  // Unregister a client
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from user tracking
    const userClientSet = this.userClients.get(client.userId);
    if (userClientSet) {
      userClientSet.delete(clientId);
      if (userClientSet.size === 0) {
        this.userClients.delete(client.userId);
      }
    }

    this.clients.delete(clientId);
    logger.debug({ clientId, userId: client.userId }, 'SSE client unregistered');
    this.emit('client:disconnected', { clientId, userId: client.userId });
  }

  // Send event to specific user(s)
  sendToUser(userId: string, event: string, data: unknown): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds || clientIds.size === 0) return;

    const message = this.formatSSE(event, data);

    for (const clientId of clientIds) {
      this.sendToClient(clientId, message);
    }
  }

  // Send event to multiple users
  sendToUsers(userIds: string[], event: string, data: unknown): void {
    const message = this.formatSSE(event, data);

    for (const userId of userIds) {
      const clientIds = this.userClients.get(userId);
      if (!clientIds) continue;

      for (const clientId of clientIds) {
        this.sendToClient(clientId, message);
      }
    }
  }

  // Broadcast to all connected users
  broadcast(event: string, data: unknown): void {
    const message = this.formatSSE(event, data);

    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, message);
    }
  }

  // Send to a specific client
  private sendToClient(clientId: string, message: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const encoder = new TextEncoder();
      client.controller.enqueue(encoder.encode(message));
      return true;
    } catch (error) {
      // Client likely disconnected
      this.unregisterClient(clientId);
      return false;
    }
  }

  // Format SSE message
  private formatSSE(event: string, data: unknown, id?: string): string {
    let message = '';
    if (id) message += `id: ${id}\n`;
    message += `event: ${event}\n`;
    message += `data: ${JSON.stringify(data)}\n\n`;
    return message;
  }

  // Send heartbeats to all clients
  private sendHeartbeats(): void {
    const message = this.formatSSE('heartbeat', { timestamp: Date.now() });

    for (const [clientId, client] of this.clients.entries()) {
      const sent = this.sendToClient(clientId, message);
      if (sent) {
        client.lastHeartbeat = new Date();
      }
    }
  }

  // Clean up stale connections
  private cleanupStaleConnections(): void {
    const staleThreshold = Date.now() - 120000; // 2 minutes

    for (const [clientId, client] of this.clients.entries()) {
      if (client.lastHeartbeat.getTime() < staleThreshold) {
        logger.debug({ clientId }, 'Removing stale SSE connection');
        try {
          client.controller.close();
        } catch {
          // Ignore
        }
        this.unregisterClient(clientId);
      }
    }
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.userClients.has(userId) && this.userClients.get(userId)!.size > 0;
  }

  // Get online user count
  getOnlineUserCount(): number {
    return this.userClients.size;
  }

  // Get total connection count
  getConnectionCount(): number {
    return this.clients.size;
  }

  // Get connection stats
  getStats(): {
    onlineUsers: number;
    totalConnections: number;
    avgConnectionsPerUser: number;
  } {
    const onlineUsers = this.userClients.size;
    const totalConnections = this.clients.size;
    return {
      onlineUsers,
      totalConnections,
      avgConnectionsPerUser: onlineUsers > 0 ? totalConnections / onlineUsers : 0,
    };
  }

  // Publish a realtime event (internal use)
  publish(event: RealtimeEvent): void {
    if (event.targetUserIds && event.targetUserIds.length > 0) {
      this.sendToUsers(event.targetUserIds, event.type, event.data);
    } else {
      this.broadcast(event.type, event.data);
    }
  }

  // Notification helpers
  notifyUser(userId: string, notification: {
    id: string;
    type: string;
    title: string;
    message?: string;
    link?: string;
  }): void {
    this.sendToUser(userId, 'notification', notification);
  }

  // Feed update helper
  notifyFeedUpdate(userIds: string[], update: {
    type: 'new_article' | 'article_updated' | 'new_comment';
    articleId?: string;
    authorId: string;
  }): void {
    this.sendToUsers(userIds, 'feed_update', update);
  }
}

// Singleton instance
export const realtimeService = new RealtimeService();

// Generate unique client ID
export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
