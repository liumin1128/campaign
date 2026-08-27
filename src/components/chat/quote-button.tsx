"use client";

import { Quote } from "flowbite-react-icons/outline";
import type { Language, QuotedMessage } from "./types";
import { t } from "./i18n";

interface QuoteButtonProps {
  message: {
    id: string;
    content: string;
    role: "system" | "user" | "assistant";
  };
  sessionId: string;
  sessionTitle: string;
  quotedMessages: QuotedMessage[];
  language: Language;
  onToggleQuote: (msg: QuotedMessage) => void;
  className?: string;
}

export function QuoteButton({
  message,
  sessionId,
  sessionTitle,
  quotedMessages,
  language,
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
      className={`inline-flex size-8 items-center justify-center rounded-md text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        isCurrentlyQuoted
          ? "text-indigo-500"
          : "text-gray-500 opacity-100 hover:bg-gray-200 hover:text-gray-700 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      } ${className}`}
      aria-pressed={isCurrentlyQuoted}
      aria-label={t(
        language,
        isCurrentlyQuoted ? "quote_cancel" : "quote_title",
      )}
      title={t(language, isCurrentlyQuoted ? "quote_cancel" : "quote_title")}
    >
      <Quote aria-hidden="true" className="size-4" />
    </button>
  );
}
