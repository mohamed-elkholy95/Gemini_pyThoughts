import { useState, useCallback, useEffect } from 'react';
import { notificationsApi, type Notification, type Pagination } from '../api';

interface UseNotificationsReturn {
  notifications: Notification[];
  pagination: Pagination | null;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  fetchNotifications: (params?: { page?: number; unreadOnly?: boolean }) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (params?: { page?: number; unreadOnly?: boolean }) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await notificationsApi.list({
      page: params?.page || 1,
      limit: 20,
      unreadOnly: params?.unreadOnly,
    });

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch notifications');
      setIsLoading(false);
      return;
    }

    setNotifications(data.notifications);
    setPagination(data.pagination);
    setUnreadCount(data.unreadCount);
    setIsLoading(false);
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    const { data } = await notificationsApi.getUnreadCount();
    if (data) {
      setUnreadCount(data.count);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { data, error: apiError } = await notificationsApi.markAsRead(notificationId);

    if (apiError || !data) {
      setError(apiError || 'Failed to mark notification as read');
      return;
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const { error: apiError } = await notificationsApi.markAllAsRead();

    if (apiError) {
      setError(apiError);
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    pagination,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    refreshUnreadCount,
  };
}

// Simplified hook for just the unread count (for navbar badge)
export function useUnreadNotificationCount(pollInterval?: number): {
  count: number;
  refresh: () => Promise<void>;
} {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { data } = await notificationsApi.getUnreadCount();
    if (data) {
      setCount(data.count);
    }
  }, []);

  useEffect(() => {
    refresh();

    if (pollInterval && pollInterval > 0) {
      const interval = setInterval(refresh, pollInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, pollInterval]);

  return { count, refresh };
}
