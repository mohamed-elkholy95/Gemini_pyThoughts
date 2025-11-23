import { useState, useCallback } from 'react';
import { feedApi, articlesApi, type ArticleWithAuthor, type Pagination } from '../api';

type FeedType = 'personalized' | 'following' | 'trending';

interface UseFeedReturn {
  articles: ArticleWithAuthor[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  fetchFeed: (params?: { type?: FeedType; page?: number; limit?: number }) => Promise<void>;
  fetchMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFeed(initialType: FeedType = 'personalized'): UseFeedReturn {
  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentType, setCurrentType] = useState<FeedType>(initialType);

  const fetchFeed = useCallback(async (params?: { type?: FeedType; page?: number; limit?: number }) => {
    setIsLoading(true);
    setError(null);

    const type = params?.type || currentType;
    if (params?.type) setCurrentType(params.type);

    const { data, error: apiError } = await feedApi.getFeed({
      type,
      page: params?.page || 1,
      limit: params?.limit || 20,
    });

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch feed');
      setIsLoading(false);
      return;
    }

    if (params?.page && params.page > 1) {
      setArticles((prev) => [...prev, ...data.articles]);
    } else {
      setArticles(data.articles);
    }
    setPagination(data.pagination);
    setIsLoading(false);
  }, [currentType]);

  const fetchMore = useCallback(async () => {
    if (!pagination || pagination.page >= pagination.pages) return;

    await fetchFeed({ page: pagination.page + 1 });
  }, [pagination, fetchFeed]);

  const refresh = useCallback(async () => {
    await fetchFeed({ page: 1 });
  }, [fetchFeed]);

  return {
    articles,
    pagination,
    isLoading,
    error,
    fetchFeed,
    fetchMore,
    refresh,
  };
}

interface UseFeaturedArticlesReturn {
  articles: ArticleWithAuthor[];
  isLoading: boolean;
  error: string | null;
  fetchFeatured: (limit?: number) => Promise<void>;
}

export function useFeaturedArticles(): UseFeaturedArticlesReturn {
  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatured = useCallback(async (limit?: number) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await articlesApi.getFeatured(limit);

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch featured articles');
      setIsLoading(false);
      return;
    }

    setArticles(data.articles);
    setIsLoading(false);
  }, []);

  return {
    articles,
    isLoading,
    error,
    fetchFeatured,
  };
}

interface UseTrendingArticlesReturn {
  articles: ArticleWithAuthor[];
  isLoading: boolean;
  error: string | null;
  fetchTrending: (params?: { page?: number; limit?: number }) => Promise<void>;
}

export function useTrendingArticles(): UseTrendingArticlesReturn {
  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async (params?: { page?: number; limit?: number }) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await feedApi.getTrending(params);

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch trending articles');
      setIsLoading(false);
      return;
    }

    setArticles(data.articles);
    setIsLoading(false);
  }, []);

  return {
    articles,
    isLoading,
    error,
    fetchTrending,
  };
}
