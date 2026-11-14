'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MissionDetail, MissionEvent, SessionInfo } from './types';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
let csrfCache: string | null = null;
let csrfRequest: Promise<string | null> | null = null;
export function setCsrf(value: string | null) {
  csrfCache = value;
  csrfRequest = Promise.resolve(value);
}
async function csrf() {
  if (csrfCache) return csrfCache;
  if (!csrfRequest)
    csrfRequest = fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((data: SessionInfo) => {
        csrfCache = data.csrfToken;
        return data.csrfToken;
      })
      .finally(() => {
        csrfRequest = null;
      });
  return csrfRequest;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = await csrf();
    if (token) headers['X-CSRF-Token'] = token;
  }
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response.', code: 'INVALID_RESPONSE' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      setCsrf(null);
      window.dispatchEvent(new Event('nexus:session-expired'));
    }
    throw new ApiError(data.error || 'The request failed.', response.status, data.code || 'REQUEST_ERROR');
  }
  return data as T;
}
export function useResource<T>(url: string, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const actualSignal = signal || controller.signal;
      setLoading(true);
      setError(null);
      try {
        const result = await api<T>(url, { signal: actualSignal });
        if (!actualSignal.aborted) setData(result);
        return result;
      } catch (e) {
        if (!actualSignal.aborted) setError(e instanceof Error ? e.message : 'Could not load this page.');
      } finally {
        if (!actualSignal.aborted) setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  return { data, setData, loading, error, refresh: () => refresh() };
}
export function useMission(id: string, initial?: MissionDetail) {
  const [detail, setDetail] = useState<MissionDetail | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState('connecting');
  const cursor = useRef(initial?.events.at(-1)?.id || '0');
  const seen = useRef(new Set(initial?.events.map((e) => e.id) || []));
  const pending = useRef<MissionEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    const buffered = pending.current.splice(0);
    try {
      const result = await api<MissionDetail>(`/api/missions/${id}`);
      if (!alive.current) return;
      const events = new Map<string, MissionEvent>();
      for (const event of [...result.events, ...buffered]) {
        events.set(event.id, event);
        if (BigInt(event.id) > BigInt(cursor.current)) cursor.current = event.id;
        seen.current.add(event.id);
      }
      result.events = [...events.values()].sort((a, b) => Number(a.id) - Number(b.id)).slice(-200);
      setDetail(result);
      setError(null);
    } catch (e) {
      pending.current.unshift(...buffered);
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not refresh the mission.');
    }
  }, [id]);
  useEffect(() => {
    alive.current = true;
    void reload();
    const source = new EventSource(`/api/missions/${id}/events?after=${cursor.current}`, {
      withCredentials: true,
    });
    source.onopen = () => {
      setConnection('live');
      void reload();
    };
    source.onerror = () => {
      if (alive.current) setConnection(source.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
    };
    source.addEventListener('mission', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as MissionEvent;
        if (seen.current.has(parsed.id)) return;
        seen.current.add(parsed.id);
        pending.current.push(parsed);
        if (BigInt(parsed.id) > BigInt(cursor.current)) cursor.current = parsed.id;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void reload(), 100);
      } catch {
        setError('An event could not be read. Reconnect to recover the persisted log.');
      }
    });
    source.addEventListener('session_expired', () => {
      setConnection('offline');
      source.close();
      window.dispatchEvent(new Event('nexus:session-expired'));
    });
    return () => {
      alive.current = false;
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, reload]);
  return { detail, setDetail, error, connection, reload };
}
export function downloadMission(id: string, format: 'json' | 'md') {
  const anchor = document.createElement('a');
  anchor.href = `/api/missions/${id}/export?format=${format}`;
  anchor.download = `nexus-${id}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
