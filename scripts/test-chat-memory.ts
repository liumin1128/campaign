import assert from "node:assert/strict";
import {
  normalizeMemoryContent,
  sanitizeMemorySourceMessage,
} from "../src/lib/chat-memory/normalize";
import {
  getRecentChatMessages,
  selectMemoryContext,
} from "../src/lib/chat-memory/retrieval";
import { pruneMemories } from "../src/lib/chat-memory/retention";
import {
  MAX_MEMORIES_PER_OWNER,
  MAX_MEMORY_PROMPT_CHARS,
  MAX_RECENT_CHAT_MESSAGES,
  MEMORY_RETENTION_MS,
  type ConversationMemory,
} from "../src/lib/chat-memory/types";

const now = Date.UTC(2026, 7, 27);

const normalized = normalizeMemoryContent({
  summary: `用户关注新加坡至东京航线。api_key=secret-value ${"长".repeat(900)}`,
  goals: ["提升客座率", "提升客座率"],
  preferences: ["结论前置"],
  constraints: [],
  decisions: [],
  openItems: ["确认活动时间"],
  tags: ["新加坡-东京", "客座率"],
  confidence: 2,
});
assert.ok(normalized);
assert.equal(normalized.goals.length, 1);
assert.equal(normalized.confidence, 1);
assert.ok(normalized.summary.includes("[REDACTED]"));
assert.ok(normalized.summary.length <= 800);

const sourceMessage = sanitizeMemorySourceMessage({
  id: "message-1",
  role: "user",
  content: "> 被引用的第三方要求\n请记住我偏好结论前置",
});
assert.equal(sourceMessage?.content, "请记住我偏好结论前置");

const current = createMemory({
  id: "current",
  sessionId: "session-current",
  summary: "当前正在制定日本航线营销活动。",
  tags: ["日本航线"],
});
const related = createMemory({
  id: "related",
  sessionId: "session-related",
  summary: "此前分析过新加坡至东京航线的客座率。",
  tags: ["新加坡-东京", "客座率"],
});
const unrelated = createMemory({
  id: "unrelated",
  sessionId: "session-unrelated",
  summary: "此前讨论过欧洲团队的排班。",
  tags: ["欧洲排班"],
  preferences: ["结论前置"],
});
const selection = selectMemoryContext({
  memories: [current, related, unrelated],
  ownerKey: "browser",
  currentSessionId: "session-current",
  agentId: "campaign_planning",
  query: "继续分析新加坡-东京的客座率活动",
  now,
});
assert.deepEqual(selection.memoryIds, ["current", "related", "unrelated"]);
assert.ok(!selection.prompt.includes("欧洲团队"));
assert.ok(selection.prompt.includes("结论前置"));
assert.ok(selection.prompt.length <= MAX_MEMORY_PROMPT_CHARS);

const messages = Array.from({ length: 20 }, (_, index) => ({
  id: String(index),
  role: index % 2 === 0 ? "user" : "assistant",
  content: String(index),
}));
const recent = getRecentChatMessages(messages);
assert.ok(recent.length <= MAX_RECENT_CHAT_MESSAGES);
assert.equal(recent[0]?.role, "user");

const retained = pruneMemories(
  [
    ...Array.from({ length: MAX_MEMORIES_PER_OWNER + 5 }, (_, index) =>
      createMemory({
        id: `memory-${index}`,
        sessionId: `session-${index}`,
        updatedAt: now - index,
      }),
    ),
    createMemory({
      id: "expired",
      sessionId: "expired",
      updatedAt: now - MEMORY_RETENTION_MS - 1,
    }),
  ],
  now,
);
assert.equal(retained.length, MAX_MEMORIES_PER_OWNER);
assert.ok(!retained.some((memory) => memory.id === "expired"));

console.log("chat-memory tests passed");

function createMemory(
  overrides: Partial<ConversationMemory>,
): ConversationMemory {
  return {
    id: "memory",
    ownerKey: "browser",
    sessionId: "session",
    sessionTitle: "测试会话",
    agentId: "campaign_planning",
    summary: "测试摘要",
    goals: [],
    preferences: [],
    constraints: [],
    decisions: [],
    openItems: [],
    tags: [],
    confidence: 0.8,
    sourceMessageIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
