"use client";

import { Quote } from "flowbite-react-icons/outline";
import type { QuotedMessage } from "./types";

interface QuoteButtonProps {
  message: {
    id: string;
    content: string;
    role: "system" | "user" | "assistant";
  };
  sessionId: string;
  sessionTitle: string;
  quotedMessages: QuotedMessage[];
  onToggleQuote: (msg: QuotedMessage) => void;
  className?: string;
}

export function QuoteButton({
  message,
  sessionId,
  sessionTitle,
  quotedMessages,
  onToggleQuote,
  className = "",
}: QuoteButtonProps) {
  if (!message.content) return null;

  const isCurrentlyQuoted = quotedMessages.some((q) => q.id === message.id);

  const handleClick = () => {
    onToggleQuote({
      id: message.id,
      content: message.content,
      role: message.role,
      sessionId,
      sessionTitle,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-md p-1 text-xs transition ${
        isCurrentlyQuoted
          ? "text-indigo-500"
          : "text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      } ${className}`}
      title={isCurrentlyQuoted ? "取消引用" : "引用此消息"}
    >
      <Quote className="size-3.5" />
    </button>
  );
}
