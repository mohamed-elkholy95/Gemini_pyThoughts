import { useState, useCallback, useRef } from 'react';
import { draftsApi, type Draft, type EditorJSContent, type Pagination } from '../api';

interface UseDraftsReturn {
  drafts: Draft[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  fetchDrafts: (params?: { status?: string; search?: string; page?: number }) => Promise<void>;
  createDraft: (data?: { title?: string; content?: EditorJSContent }) => Promise<Draft | null>;
  updateDraft: (id: string, data: Partial<Draft>) => Promise<Draft | null>;
  deleteDraft: (id: string) => Promise<boolean>;
  publishDraft: (id: string) => Promise<Draft | null>;
  unpublishDraft: (id: string) => Promise<Draft | null>;
}

export function useDrafts(): UseDraftsReturn {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async (params?: { status?: string; search?: string; page?: number }) => {
    setIsLoading(true);
    setError(null);

    const { data, error: apiError } = await draftsApi.list(params);

    if (apiError || !data) {
      setError(apiError || 'Failed to fetch drafts');
      setIsLoading(false);
      return;
    }

    setDrafts(data.drafts);
    setPagination(data.pagination);
    setIsLoading(false);
  }, []);

  const createDraft = useCallback(async (data?: { title?: string; content?: EditorJSContent }) => {
    const { data: result, error: apiError } = await draftsApi.create(data || {});

    if (apiError || !result) {
      setError(apiError || 'Failed to create draft');
      return null;
    }

    setDrafts((prev) => [result.draft, ...prev]);
    return result.draft;
  }, []);

  const updateDraft = useCallback(async (id: string, data: Partial<Draft>) => {
    const { data: result, error: apiError } = await draftsApi.update(id, data);

    if (apiError || !result) {
      setError(apiError || 'Failed to update draft');
      return null;
    }

    setDrafts((prev) => prev.map((d) => (d.id === id ? result.draft : d)));
    return result.draft;
  }, []);

  const deleteDraft = useCallback(async (id: string) => {
    const { error: apiError } = await draftsApi.delete(id);

    if (apiError) {
      setError(apiError);
      return false;
    }

    setDrafts((prev) => prev.filter((d) => d.id !== id));
    return true;
  }, []);

  const publishDraft = useCallback(async (id: string) => {
    const { data: result, error: apiError } = await draftsApi.publish(id);

    if (apiError || !result) {
      setError(apiError || 'Failed to publish draft');
      return null;
    }

    setDrafts((prev) => prev.map((d) => (d.id === id ? result.draft : d)));
    return result.draft;
  }, []);

  const unpublishDraft = useCallback(async (id: string) => {
    const { data: result, error: apiError } = await draftsApi.unpublish(id);

    if (apiError || !result) {
      setError(apiError || 'Failed to unpublish draft');
      return null;
    }

    setDrafts((prev) => prev.map((d) => (d.id === id ? result.draft : d)));
    return result.draft;
  }, []);

  return {
    drafts,
    pagination,
    isLoading,
    error,
    fetchDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    publishDraft,
    unpublishDraft,
  };
}

// Hook for auto-save functionality
export function useAutoSave(draftId: string | null) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const save = useCallback(
    async (content: EditorJSContent) => {
      if (!draftId) return;

      setIsSaving(true);
      setError(null);

      const { data, error: apiError } = await draftsApi.autoSave(draftId, content);

      if (apiError || !data) {
        setError(apiError || 'Failed to save');
        setIsSaving(false);
        return;
      }

      setLastSaved(new Date(data.savedAt));
      setIsSaving(false);
    },
    [draftId]
  );

  // Debounced save
  const debouncedSave = useCallback(
    (content: EditorJSContent, delay = 2000) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        save(content);
      }, delay);
    },
    [save]
  );

  // Cancel pending save
  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    isSaving,
    lastSaved,
    error,
    save,
    debouncedSave,
    cancelSave,
  };
}
