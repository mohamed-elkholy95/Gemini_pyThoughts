import { useState, useCallback } from 'react';
import { tagsApi, type Tag, type ArticleWithAuthor, type Pagination } from '../api';

interface UseTagsReturn {
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
  fetchTags: () => Promise<void>;
  fetchPopular: (limit?: number) => Promise<void>;
}

export function useTags(): UseTagsReturn {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await tagsApi.list();

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch tags');
      setIsLoading(false);
      return;
    }

    setTags(data.tags);
    setIsLoading(false);
  }, []);

  const fetchPopular = useCallback(async (limit?: number) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await tagsApi.getPopular(limit);

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch popular tags');
      setIsLoading(false);
      return;
    }

    setTags(data.tags);
    setIsLoading(false);
  }, []);

  return {
    tags,
    isLoading,
    error,
    fetchTags,
    fetchPopular,
  };
}

interface UseTagArticlesReturn {
  tag: Tag | null;
  articles: ArticleWithAuthor[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  fetchTagArticles: (slug: string, params?: { page?: number; limit?: number }) => Promise<void>;
}

export function useTagArticles(): UseTagArticlesReturn {
  const [tag, setTag] = useState<Tag | null>(null);
  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTagArticles = useCallback(async (slug: string, params?: { page?: number; limit?: number }) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await tagsApi.getArticles(slug, params);

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch tag articles');
      setIsLoading(false);
      return;
    }

    setTag(data.tag);
    setArticles(data.articles);
    setPagination(data.pagination);
    setIsLoading(false);
  }, []);

  return {
    tag,
    articles,
    pagination,
    isLoading,
    error,
    fetchTagArticles,
  };
}
