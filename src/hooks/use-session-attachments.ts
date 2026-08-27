"use client";

import { useCallback, useRef, useState } from "react";
import type { FileAttachment } from "@/components/chat/types";

type AttachmentUpdater = (current: FileAttachment[]) => FileAttachment[];

export function useSessionAttachments(activeSessionId?: string) {
  const attachmentsRef = useRef<Record<string, FileAttachment[]>>({});
  const pendingOperationsRef = useRef<Record<string, Set<string>>>({});
  const [attachmentsBySession, setAttachmentsBySession] = useState<
    Record<string, FileAttachment[]>
  >({});
  const [preparingSessionIds, setPreparingSessionIds] = useState<string[]>([]);

  const update = useCallback((sessionId: string, updater: AttachmentUpdater) => {
    const nextAttachments = updater(attachmentsRef.current[sessionId] ?? []);
    const nextState = { ...attachmentsRef.current };

    if (nextAttachments.length > 0) nextState[sessionId] = nextAttachments;
    else delete nextState[sessionId];

    attachmentsRef.current = nextState;
    setAttachmentsBySession(nextState);
  }, []);

  const append = useCallback(
    (sessionId: string, attachments: FileAttachment[]) => {
      if (attachments.length > 0) {
        update(sessionId, (current) => [...current, ...attachments]);
      }
    },
    [update],
  );

  const clear = useCallback(
    (sessionId: string) => update(sessionId, () => []),
    [update],
  );

  const removeAt = useCallback(
    (sessionId: string, index: number) =>
      update(sessionId, (current) =>
        current.filter((_, currentIndex) => currentIndex !== index),
      ),
    [update],
  );

  const patchById = useCallback(
    (
      sessionId: string,
      attachmentId: string,
      updater: (attachment: FileAttachment) => FileAttachment,
    ) => {
      update(sessionId, (current) =>
        current.map((attachment) =>
          attachment.id === attachmentId ? updater(attachment) : attachment,
        ),
      );
    },
    [update],
  );

  const syncPreparingSessions = useCallback(() => {
    setPreparingSessionIds(
      Object.entries(pendingOperationsRef.current)
        .filter(([, operations]) => operations.size > 0)
        .map(([sessionId]) => sessionId),
    );
  }, []);

  const beginPreparing = useCallback(
    (sessionId: string) => {
      const operationId = crypto.randomUUID();
      const operations =
        pendingOperationsRef.current[sessionId] ?? new Set<string>();
      operations.add(operationId);
      pendingOperationsRef.current[sessionId] = operations;
      syncPreparingSessions();
      return operationId;
    },
    [syncPreparingSessions],
  );

  const finishPreparing = useCallback(
    (sessionId: string, operationId: string) => {
      const operations = pendingOperationsRef.current[sessionId];
      if (!operations?.delete(operationId)) return;
      if (operations.size === 0) delete pendingOperationsRef.current[sessionId];
      syncPreparingSessions();
    },
    [syncPreparingSessions],
  );

  const dropSession = useCallback(
    (sessionId: string) => {
      clear(sessionId);
      delete pendingOperationsRef.current[sessionId];
      syncPreparingSessions();
    },
    [clear, syncPreparingSessions],
  );

  const get = useCallback(
    (sessionId: string) => attachmentsRef.current[sessionId] ?? [],
    [],
  );

  return {
    attachments: activeSessionId
      ? (attachmentsBySession[activeSessionId] ?? [])
      : [],
    preparingSessionIds,
    append,
    clear,
    removeAt,
    patchById,
    get,
    beginPreparing,
    finishPreparing,
    dropSession,
  };
}
