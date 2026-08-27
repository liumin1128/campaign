"use client";

import { useState } from "react";
import type { Language } from "./types";
import { t } from "./i18n";
import { ChevronRight } from "flowbite-react-icons/outline";

export function ReasoningBlock({
  text,
  language,
}: {
  text: string;
  language: Language;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;

  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 text-xs dark:border-amber-800 dark:bg-amber-950">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-amber-700 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 dark:text-amber-400 dark:hover:text-amber-200"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="font-medium">{t(language, "reasoning_title")}</span>
        {!expanded && isLong && (
          <span className="text-amber-500">
            {t(language, "reasoning_collapsed")}
          </span>
        )}
      </button>
      {expanded && (
        <div className="max-h-60 overflow-y-auto border-t border-amber-200 px-3 py-2 text-gray-600 leading-relaxed dark:border-amber-800 dark:text-slate-300">
          {text}
        </div>
      )}
    </div>
  );
}
