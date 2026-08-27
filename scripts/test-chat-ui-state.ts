import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionRequestRegistry } from "../src/lib/chat/session-request-registry";
import MarkdownDisplay from "../src/components/markdown-display";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage,
});

async function testSessionLimitAndTitles() {
  const { MAX_SESSIONS, useChatStore } = await import("../src/store/chat-store");
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    language: "zh",
    enableThinking: false,
    draftInputs: {},
    quotedMessages: [],
  });
  const firstId = useChatStore.getState().createSession();
  assert.ok(firstId);

  useChatStore.getState().setLanguage("en");
  let session = useChatStore
    .getState()
    .sessions.find((item) => item.id === firstId);
  assert.equal(session?.title, "New Chat");

  useChatStore.getState().updateSessionMessages(firstId, [
    ...(session?.messages ?? []),
    { id: crypto.randomUUID(), role: "user", content: "Plan a spring campaign" },
  ]);
  session = useChatStore.getState().sessions.find((item) => item.id === firstId);
  assert.equal(session?.title, "Plan a spring campaign");

  useChatStore.getState().renameSession(firstId, "Priority campaign");
  useChatStore.getState().updateSessionMessages(firstId, [
    ...(session?.messages ?? []),
    { id: crypto.randomUUID(), role: "user", content: "Another prompt" },
  ]);
  session = useChatStore.getState().sessions.find((item) => item.id === firstId);
  assert.equal(session?.title, "Priority campaign");

  while (useChatStore.getState().sessions.length < MAX_SESSIONS) {
    assert.ok(useChatStore.getState().createSession());
  }
  assert.equal(useChatStore.getState().createSession(), null);
  assert.equal(useChatStore.getState().sessions.length, MAX_SESSIONS);
}

function testRequestRegistry() {
  const registry = new SessionRequestRegistry();
  const first = registry.begin("session-a");
  assert.ok(first);
  assert.equal(registry.begin("session-a"), null);

  const other = registry.begin("session-b");
  assert.ok(other);
  registry.abort("session-a");
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(registry.has("session-a"), true);
  assert.equal(registry.has("session-b"), true);

  assert.equal(registry.finish(first), true);
  assert.equal(registry.has("session-a"), false);
  assert.equal(registry.has("session-b"), true);

  assert.equal(registry.cancel("session-b"), true);
  const replacement = registry.begin("session-b");
  assert.ok(replacement);
  assert.equal(registry.finish(other), false);
  assert.equal(registry.has("session-b"), true);
  assert.equal(registry.finish(replacement), true);
}

function testMarkdownCodeStructure() {
  const markup = renderToStaticMarkup(
    React.createElement(MarkdownDisplay, {
      content: "```js\nconst value = 1;\n```",
    }),
  );
  assert.equal(markup.includes("<pre><div"), false);
  assert.equal(markup.match(/<pre/g)?.length, 1);
}

async function main() {
  testRequestRegistry();
  testMarkdownCodeStructure();
  await testSessionLimitAndTitles();
  console.log("chat UI state tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
