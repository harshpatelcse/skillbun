'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeDataSync } from '@/utils/client/dataSyncManager';
import { adminRetryDelay } from '@/utils/client/adminDashboard.mjs';

const emptyState = () => ({ analytics: null, employees: [], milestones: [], errors: {}, loaded: {}, pagination: null, updatedAt: null });

export default function useAdminOverview(user) {
  const [data, setData] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshWait, setRefreshWait] = useState(0);
  const [retryWait, setRetryWait] = useState(0);
  const controller = useRef(null);
  const moreController = useRef(null);
  const refreshReadyAt = useRef(0);
  const retryAt = useRef(0);
  const request = useCallback(async (url, signal) => {
    const token = await user.getIdToken();
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      if (response.status === 429 && !signal.aborted) {
        retryAt.current = Math.max(retryAt.current, Date.now() + adminRetryDelay(response, body));
      }
      const error = new Error(response.status === 401 || response.status === 403 ? 'Your admin session could not be verified. Sign in again.' : response.status === 429 ? 'Too many requests. Please wait for the refresh countdown before trying again.' : body.error?.message || (typeof body.error === 'string' ? body.error : 'Could not load this section. Try refreshing.'));
      error.status = response.status;
      throw error;
    }
    return body;
  }, [user]);

  const refresh = useCallback(async () => {
    // Keep one request batch in flight and pace manual and cross-tab refreshes.
    if (controller.current || moreController.current || Date.now() < Math.max(refreshReadyAt.current, retryAt.current)) return;
    refreshReadyAt.current = Date.now() + 15_000;
    setRefreshWait(15);
    const next = new AbortController(); controller.current = next;
    setLoading(true);
    const results = await Promise.allSettled([
      request('/api/admin/workforce/employees?limit=50', next.signal),
      request('/api/admin/workforce/milestones', next.signal),
      request('/api/admin/analytics', next.signal),
    ]);
    if (controller.current === next) controller.current = null;
    if (next.signal.aborted) return;
    if (results.some(result => result.status === 'rejected' && [401, 403].includes(result.reason.status))) {
      setData({ ...emptyState(), errors: { session: 'Your admin session could not be verified. Sign in again to continue.' } });
      setLoading(false); return;
    }
    const nextData = emptyState();
    ['employees', 'milestones', 'analytics'].forEach((key, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        nextData[key] = key === 'analytics' ? result.value : result.value[key] || [];
        nextData.loaded[key] = true;
        if (key === 'employees') nextData.pagination = result.value.pagination;
      } else nextData.errors[key] = result.reason.message;
    });
    nextData.updatedAt = new Date().toISOString(); setData(nextData); setLoading(false);
  }, [request]);

  const loadMore = useCallback(async () => {
    if (!data.pagination?.has_more || controller.current || moreController.current || Date.now() < retryAt.current || loadingMore || loading) return;
    moreController.current?.abort(); const next = new AbortController(); moreController.current = next;
    setLoadingMore(true);
    try {
      const body = await request(`/api/admin/workforce/employees?limit=50&pageToken=${encodeURIComponent(data.pagination.next_page_token)}`, next.signal);
      if (next.signal.aborted) return;
      setData(previous => ({ ...previous, errors: { ...previous.errors, employees: null }, employees: [...new Map([...previous.employees, ...(body.employees || [])].map(item => [item.id, item])).values()], pagination: body.pagination }));
    } catch (error) {
      if (!next.signal.aborted) setData(previous => [401, 403].includes(error.status) ? { ...emptyState(), errors: { session: error.message } } : { ...previous, errors: { ...previous.errors, employees: error.message } });
    } finally {
      if (moreController.current === next) moreController.current = null;
      if (!next.signal.aborted) setLoadingMore(false);
    }
  }, [data.pagination, loading, loadingMore, request]);

  useEffect(() => {
    let timer = window.setTimeout(refresh, 0);
    const syncRefresh = () => {
      const delay = Math.max(refreshReadyAt.current, retryAt.current) - Date.now();
      if (controller.current || moreController.current || delay > 0) {
        timer = window.setTimeout(syncRefresh, Math.min(2_147_483_647, Math.max(1000, delay)));
      } else refresh();
    };
    const unsubscribe = subscribeDataSync(({ tag }) => {
      if (tag?.startsWith('admin:')) {
        window.clearTimeout(timer);
        timer = window.setTimeout(syncRefresh, 500);
      }
    });
    const countdown = window.setInterval(() => {
      setRefreshWait(Math.max(0, Math.ceil((Math.max(refreshReadyAt.current, retryAt.current) - Date.now()) / 1000)));
      setRetryWait(Math.max(0, Math.ceil((retryAt.current - Date.now()) / 1000)));
    }, 1000);
    return () => {
      window.clearTimeout(timer); window.clearInterval(countdown);
      controller.current?.abort(); moreController.current?.abort(); unsubscribe();
      controller.current = null; moreController.current = null; refreshReadyAt.current = 0;
    };
  }, [refresh]);
  return { data, loading, loadingMore, refresh, loadMore, refreshWait, retryWait };
}
