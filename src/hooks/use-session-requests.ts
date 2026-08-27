"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SessionRequestRegistry,
  type SessionRequestToken,
} from "@/lib/chat/session-request-registry";

export function useSessionRequests() {
  const registryRef = useRef<SessionRequestRegistry | null>(null);
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);

  if (registryRef.current === null) {
    registryRef.current = new SessionRequestRegistry();
  }

  const syncActiveSessions = useCallback(() => {
    setActiveSessionIds(registryRef.current?.activeSessionIds() ?? []);
  }, []);

  const beginRequest = useCallback(
    (sessionId: string) => {
      const token = registryRef.current?.begin(sessionId) ?? null;
      if (token) syncActiveSessions();
      return token;
    },
    [syncActiveSessions],
  );

  const finishRequest = useCallback(
    (token: SessionRequestToken) => {
      if (registryRef.current?.finish(token)) syncActiveSessions();
    },
    [syncActiveSessions],
  );

  const abortRequest = useCallback((sessionId: string) => {
    registryRef.current?.abort(sessionId);
  }, []);

  const cancelRequest = useCallback(
    (sessionId: string) => {
      if (registryRef.current?.cancel(sessionId)) syncActiveSessions();
    },
    [syncActiveSessions],
  );

  const hasActiveRequest = useCallback(
    (sessionId: string | null | undefined) =>
      registryRef.current?.has(sessionId) ?? false,
    [],
  );

  useEffect(() => {
    const registry = registryRef.current;
    return () => registry?.abortAll();
  }, []);

  return {
    activeSessionIds,
    beginRequest,
    finishRequest,
    abortRequest,
    cancelRequest,
    hasActiveRequest,
  };
}
