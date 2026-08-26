"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Message, Language } from "@/components/chat/types";
import {
  normalizeMemoryContent,
  sanitizeMemorySourceMessage,
} from "@/lib/chat-memory/normalize";
import {
  buildMemoryOwnerKey,
  selectMemoryContext,
} from "@/lib/chat-memory/retrieval";
import {
  MAX_MEMORY_SOURCE_IDS,
  MAX_MEMORY_SOURCE_MESSAGES,
  type ConversationMemory,
  type SummarizeMemoryResponse,
} from "@/lib/chat-memory/types";
import { useChatMemoryStore } from "@/store/chat-memory-store";
import { useTeamsUserStore } from "@/store/teams-user-store";

interface ScheduleMemoryUpdateArgs {
  sessionId: string;
  sessionTitle: string;
  agentId: string;
  language: Language;
  messages: Message[];
}

export function useChatMemory() {
  const teamsInfo = useTeamsUserStore((state) => state.info);
  const ownerKey = buildMemoryOwnerKey(teamsInfo);
  const enabled = useChatMemoryStore((state) => state.enabled);
  const memories = useChatMemoryStore((state) => state.memories);
  const setStoreEnabled = useChatMemoryStore((state) => state.setEnabled);
  const removeStoreMemory = useChatMemoryStore((state) => state.removeMemory);
  const removeStoreSessionMemory = useChatMemoryStore(
    (state) => state.removeSessionMemory,
  );
  const clearStoreMemories = useChatMemoryStore(
    (state) => state.clearMemories,
  );
  const queuesRef = useRef(new Map<string, Promise<void>>());
  const generationRef = useRef(0);
  const forgottenSessionsRef = useRef(new Set<string>());

  const ownerMemories = useMemo(
    () =>
      memories
        .filter((memory) => memory.ownerKey === ownerKey)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [memories, ownerKey],
  );

  const getMemoryContext = useCallback(
    (query: string, currentSessionId: string, agentId: string) => {
      if (!useChatMemoryStore.getState().enabled) {
        return {
          currentMemory: undefined,
          relatedMemories: [],
          globalPreferences: [],
          memoryIds: [],
          prompt: "",
        };
      }
      return selectMemoryContext({
        memories: useChatMemoryStore.getState().memories,
        ownerKey,
        currentSessionId,
        agentId,
        query,
      });
    },
    [ownerKey],
  );

  const markMemoriesUsed = useCallback(
    (memoryIds: string[]) => {
      useChatMemoryStore.getState().touchMemories(ownerKey, memoryIds);
    },
    [ownerKey],
  );

  const scheduleMemoryUpdate = useCallback(
    (args: ScheduleMemoryUpdateArgs) => {
      if (!useChatMemoryStore.getState().enabled) return;

      const queueKey = `${ownerKey}:${args.sessionId}`;
      const generation = generationRef.current;
      forgottenSessionsRef.current.delete(queueKey);
      const previousTask = queuesRef.current.get(queueKey) ?? Promise.resolve();
      const task = previousTask
        .catch(() => undefined)
        .then(async () => {
          if (
            generation !== generationRef.current ||
            forgottenSessionsRef.current.has(queueKey) ||
            !useChatMemoryStore.getState().enabled
          ) {
            return;
          }

          const state = useChatMemoryStore.getState();
          const previousMemory = state.memories.find(
            (memory) =>
              memory.ownerKey === ownerKey &&
              memory.sessionId === args.sessionId,
          );
          const lastSummarizedId = previousMemory?.sourceMessageIds.at(-1);
          const lastSummarizedIndex = lastSummarizedId
            ? args.messages.findIndex((message) => message.id === lastSummarizedId)
            : -1;
          const unsummarizedMessages =
            lastSummarizedIndex >= 0
              ? args.messages.slice(lastSummarizedIndex + 1)
              : args.messages.slice(-MAX_MEMORY_SOURCE_MESSAGES);
          const sourceMessages = unsummarizedMessages
            .filter(
              (message) =>
                message.id !== "welcome" &&
                (message.role === "user" || message.role === "assistant") &&
                !!message.content.trim(),
            )
            .slice(-MAX_MEMORY_SOURCE_MESSAGES)
            .flatMap((message) => {
              const sanitized = sanitizeMemorySourceMessage({
                id: message.id,
                role: message.role as "user" | "assistant",
                content: message.content,
              });
              return sanitized ? [sanitized] : [];
            });

          if (
            sourceMessages.length === 0 ||
            !sourceMessages.some((message) => message.role === "user")
          ) {
            return;
          }

          const response = await fetch("/api/chat/memory/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previousMemory: previousMemory
                ? toMemoryContent(previousMemory)
                : undefined,
              messages: sourceMessages,
              agentId: args.agentId,
              language: args.language,
            }),
          });
          const data = (await response.json()) as SummarizeMemoryResponse;
          if (!response.ok || !data.ok) {
            throw new Error(data.ok ? "Memory summary failed" : data.error);
          }

          const content = normalizeMemoryContent(data.memory);
          if (
            !content ||
            generation !== generationRef.current ||
            forgottenSessionsRef.current.has(queueKey) ||
            !useChatMemoryStore.getState().enabled
          ) {
            return;
          }

          const now = Date.now();
          const memory: ConversationMemory = {
            ...content,
            id: previousMemory?.id ?? crypto.randomUUID(),
            ownerKey,
            sessionId: args.sessionId,
            sessionTitle: args.sessionTitle,
            agentId: args.agentId,
            sourceMessageIds: [
              ...(previousMemory?.sourceMessageIds ?? []),
              ...sourceMessages.map((message) => message.id),
            ].slice(-MAX_MEMORY_SOURCE_IDS),
            createdAt: previousMemory?.createdAt ?? now,
            updatedAt: now,
            lastUsedAt: previousMemory?.lastUsedAt,
          };
          useChatMemoryStore.getState().upsertMemory(memory);
        })
        .catch((error) => {
          console.warn(
            "[chat-memory] Failed to update conversation memory:",
            error,
          );
        });

      queuesRef.current.set(queueKey, task);
      void task.finally(() => {
        if (queuesRef.current.get(queueKey) === task) {
          queuesRef.current.delete(queueKey);
        }
      });
    },
    [ownerKey],
  );

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      if (!nextEnabled) generationRef.current += 1;
      setStoreEnabled(nextEnabled);
    },
    [setStoreEnabled],
  );

  const removeMemory = useCallback(
    (memoryId: string) => {
      const memory = useChatMemoryStore
        .getState()
        .memories.find(
          (item) => item.ownerKey === ownerKey && item.id === memoryId,
        );
      if (memory) {
        forgottenSessionsRef.current.add(`${ownerKey}:${memory.sessionId}`);
      }
      removeStoreMemory(ownerKey, memoryId);
    },
    [ownerKey, removeStoreMemory],
  );

  const forgetSession = useCallback(
    (sessionId: string) => {
      forgottenSessionsRef.current.add(`${ownerKey}:${sessionId}`);
      removeStoreSessionMemory(ownerKey, sessionId);
    },
    [ownerKey, removeStoreSessionMemory],
  );

  const clearMemories = useCallback(() => {
    generationRef.current += 1;
    clearStoreMemories(ownerKey);
  }, [clearStoreMemories, ownerKey]);

  return {
    ownerKey,
    enabled,
    memories: ownerMemories,
    getMemoryContext,
    markMemoriesUsed,
    scheduleMemoryUpdate,
    setEnabled,
    removeMemory,
    forgetSession,
    clearMemories,
  };
}

function toMemoryContent(memory: ConversationMemory) {
  return {
    summary: memory.summary,
    goals: memory.goals,
    preferences: memory.preferences,
    constraints: memory.constraints,
    decisions: memory.decisions,
    openItems: memory.openItems,
    tags: memory.tags,
    confidence: memory.confidence,
  };
}
