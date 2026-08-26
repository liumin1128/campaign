import {
  MAX_MEMORIES_PER_OWNER,
  MEMORY_RETENTION_MS,
  type ConversationMemory,
} from "./types";

export function pruneMemories(
  memories: ConversationMemory[],
  now = Date.now(),
) {
  const active = memories.filter(
    (memory) => now - memory.updatedAt <= MEMORY_RETENTION_MS,
  );
  const byOwner = new Map<string, ConversationMemory[]>();

  for (const memory of active) {
    const ownerMemories = byOwner.get(memory.ownerKey) ?? [];
    ownerMemories.push(memory);
    byOwner.set(memory.ownerKey, ownerMemories);
  }

  return [...byOwner.values()]
    .flatMap((ownerMemories) =>
      ownerMemories
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_MEMORIES_PER_OWNER),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
