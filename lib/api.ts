// API Client for Pythoughts Backend

const API_BASE = import.meta.env?.VITE_API_URL || '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// Generic fetch wrapper
async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers = {} } = options;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: data.message || data.error || 'An error occurred',
      };
    }

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  bio?: string;
  createdAt: string;
}

export interface UserProfile extends User {
  stats: {
    followers: number;
    following: number;
    articles: number;
  };
  isFollowing: boolean;
}

export interface EditorJSBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EditorJSContent {
  time?: number;
  blocks: EditorJSBlock[];
  version?: string;
}

export interface Draft {
  id: string;
  title: string;
  content: EditorJSContent | null;
  excerpt?: string;
  coverImage?: string;
  slug?: string;
  status: 'draft' | 'published' | 'archived';
  authorId: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  readingTime: number;
}

export interface Article {
  id: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  slug?: string;
  authorId: string;
  publishedAt?: string;
  wordCount: number;
  readingTime: number;
}

export interface Comment {
  id: string;
  content: string;
  draftId: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image?: string;
  };
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Auth API
export const authApi = {
  async signUp(email: string, password: string, name: string) {
    return apiRequest<{ user: User }>('/auth/sign-up/email', {
      method: 'POST',
      body: { email, password, name },
    });
  },

  async signIn(email: string, password: string) {
    return apiRequest<{ user: User; session: unknown }>('/auth/sign-in/email', {
      method: 'POST',
      body: { email, password },
    });
  },

  async signOut() {
    return apiRequest<{ success: boolean }>('/auth/sign-out', {
      method: 'POST',
    });
  },

  async getSession() {
    return apiRequest<{ user: User; session: unknown } | null>('/auth/get-session');
  },
};

// Drafts API
export const draftsApi = {
  async list(params?: PaginationParams & { status?: string; search?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return apiRequest<{ drafts: Draft[]; pagination: Pagination }>(`/drafts${query ? `?${query}` : ''}`);
  },

  async get(id: string) {
    return apiRequest<{ draft: Draft }>(`/drafts/${id}`);
  },

  async create(data: { title?: string; content?: EditorJSContent; excerpt?: string }) {
    return apiRequest<{ draft: Draft }>('/drafts', {
      method: 'POST',
      body: data,
    });
  },

  async update(id: string, data: Partial<Draft>) {
    return apiRequest<{ draft: Draft }>(`/drafts/${id}`, {
      method: 'PATCH',
      body: data,
    });
  },

  async autoSave(id: string, content: EditorJSContent) {
    return apiRequest<{ draft: Draft; savedAt: string }>(`/drafts/${id}/autosave`, {
      method: 'PUT',
      body: { content },
    });
  },

  async publish(id: string) {
    return apiRequest<{ draft: Draft }>(`/drafts/${id}/publish`, {
      method: 'POST',
    });
  },

  async unpublish(id: string) {
    return apiRequest<{ draft: Draft }>(`/drafts/${id}/unpublish`, {
      method: 'POST',
    });
  },

  async delete(id: string) {
    return apiRequest<{ message: string }>(`/drafts/${id}`, {
      method: 'DELETE',
    });
  },

  async restore(id: string) {
    return apiRequest<{ draft: Draft }>(`/drafts/${id}/restore`, {
      method: 'POST',
    });
  },

  async getVersions(id: string) {
    return apiRequest<{ versions: Array<{ id: string; version: number; title: string; createdAt: string }> }>(
      `/drafts/${id}/versions`
    );
  },

  async restoreVersion(draftId: string, versionId: string) {
    return apiRequest<{ draft: Draft }>(`/drafts/${draftId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  },
};

// Articles API (public)
export const articlesApi = {
  async list(params?: PaginationParams & { author?: string; search?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.author) searchParams.set('author', params.author);
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return apiRequest<{ articles: Article[]; pagination: Pagination }>(`/articles${query ? `?${query}` : ''}`);
  },

  async get(id: string) {
    return apiRequest<{ article: Draft }>(`/articles/${id}`);
  },

  async getBySlug(slug: string) {
    return apiRequest<{ article: Draft }>(`/articles/slug/${slug}`);
  },
};

// Users API
export const usersApi = {
  async getMe() {
    return apiRequest<{ user: UserProfile }>('/users/me');
  },

  async updateMe(data: { name?: string; bio?: string; image?: string }) {
    return apiRequest<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: data,
    });
  },

  async getProfile(id: string) {
    return apiRequest<{ user: UserProfile }>(`/users/${id}`);
  },

  async follow(userId: string) {
    return apiRequest<{ message: string }>(`/users/${userId}/follow`, {
      method: 'POST',
    });
  },

  async unfollow(userId: string) {
    return apiRequest<{ message: string }>(`/users/${userId}/follow`, {
      method: 'DELETE',
    });
  },

  async getFollowers(userId: string, params?: PaginationParams) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiRequest<{ users: Array<User & { followedAt: string }>; pagination: Pagination }>(
      `/users/${userId}/followers${query ? `?${query}` : ''}`
    );
  },

  async getFollowing(userId: string, params?: PaginationParams) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiRequest<{ users: Array<User & { followedAt: string }>; pagination: Pagination }>(
      `/users/${userId}/following${query ? `?${query}` : ''}`
    );
  },

  async getBookmarks(params?: PaginationParams) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiRequest<{ bookmarks: Array<Article & { bookmarkedAt: string }>; pagination: Pagination }>(
      `/users/me/bookmarks${query ? `?${query}` : ''}`
    );
  },

  async bookmark(draftId: string) {
    return apiRequest<{ message: string }>(`/users/me/bookmarks/${draftId}`, {
      method: 'POST',
    });
  },

  async removeBookmark(draftId: string) {
    return apiRequest<{ message: string }>(`/users/me/bookmarks/${draftId}`, {
      method: 'DELETE',
    });
  },
};

// Comments API
export const commentsApi = {
  async getByArticle(draftId: string, params?: PaginationParams) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiRequest<{ comments: Comment[]; pagination: Pagination }>(
      `/comments/article/${draftId}${query ? `?${query}` : ''}`
    );
  },

  async getReplies(commentId: string, params?: PaginationParams) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiRequest<{ replies: Comment[]; pagination: Pagination }>(
      `/comments/${commentId}/replies${query ? `?${query}` : ''}`
    );
  },

  async create(draftId: string, content: string, parentId?: string) {
    return apiRequest<{ comment: Comment }>(`/comments/article/${draftId}`, {
      method: 'POST',
      body: { content, parentId },
    });
  },

  async update(commentId: string, content: string) {
    return apiRequest<{ comment: Comment }>(`/comments/${commentId}`, {
      method: 'PATCH',
      body: { content },
    });
  },

  async delete(commentId: string) {
    return apiRequest<{ message: string }>(`/comments/${commentId}`, {
      method: 'DELETE',
    });
  },

  async getCount(draftId: string) {
    return apiRequest<{ count: number }>(`/comments/article/${draftId}/count`);
  },
};

// Export all APIs
export const api = {
  auth: authApi,
  drafts: draftsApi,
  articles: articlesApi,
  users: usersApi,
  comments: commentsApi,
};

export default api;
