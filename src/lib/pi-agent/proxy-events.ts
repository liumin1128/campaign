import type { ProxyAssistantMessageEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";

export function toProxyAssistantEvent(
  event: AssistantMessageEvent,
): ProxyAssistantMessageEvent {
  switch (event.type) {
    case "start":
      return { type: "start" };
    case "text_start":
      return { type: "text_start", contentIndex: event.contentIndex };
    case "text_delta":
      return {
        type: "text_delta",
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case "text_end": {
      const block = event.partial.content[event.contentIndex];
      return {
        type: "text_end",
        contentIndex: event.contentIndex,
        ...(block?.type === "text" && typeof block.textSignature === "string"
          ? { contentSignature: block.textSignature }
          : {}),
      };
    }
    case "thinking_start":
      return { type: "thinking_start", contentIndex: event.contentIndex };
    case "thinking_delta":
      return {
        type: "thinking_delta",
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case "thinking_end": {
      const block = event.partial.content[event.contentIndex];
      return {
        type: "thinking_end",
        contentIndex: event.contentIndex,
        ...(block?.type === "thinking" &&
        typeof block.thinkingSignature === "string"
          ? { contentSignature: block.thinkingSignature }
          : {}),
      };
    }
    case "toolcall_start": {
      const block = event.partial.content[event.contentIndex];
      if (block?.type !== "toolCall") {
        throw new Error("Pi stream returned an invalid tool-call start event");
      }
      return {
        type: "toolcall_start",
        contentIndex: event.contentIndex,
        id: block.id,
        toolName: block.name,
      };
    }
    case "toolcall_delta":
      return {
        type: "toolcall_delta",
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case "toolcall_end":
      return {
        type: "toolcall_end",
        contentIndex: event.contentIndex,
        toolCall: event.toolCall,
      };
    case "done":
      if (event.reason === "deferred") {
        throw new Error("Deferred responses are not supported by this proxy");
      }
      return {
        type: "done",
        reason: event.reason,
        usage: event.message.usage,
      };
    case "error":
      return {
        type: "error",
        reason: event.reason,
        errorMessage: event.error.errorMessage,
        usage: event.error.usage,
      };
  }
}
