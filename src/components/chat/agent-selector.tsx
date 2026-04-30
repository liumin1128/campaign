"use client";

import type { AgentOption, Language } from "./types";
import { AGENT_ICONS } from "./constants";
import { getLocalizedAgents, t } from "./i18n";

interface AgentSelectorProps {
  selectedAgent: AgentOption;
  language: Language;
  onSelect: (agent: AgentOption) => void;
}

export function AgentSelector({
  selectedAgent,
  language,
  onSelect,
}: AgentSelectorProps) {
  const agents = getLocalizedAgents(language);

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2">
        {agents.map((agent) => {
          const isSelected = selectedAgent?.id === agent.id;
          const IconComponent = AGENT_ICONS[agent.id];

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                isSelected
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300"
                  : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              <div
                className={`flex size-5 items-center justify-center rounded ${
                  isSelected
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-gray-400 dark:text-slate-500"
                }`}
              >
                {IconComponent && <IconComponent className="size-3.5" />}
              </div>
              <span>{agent.name}</span>
              {isSelected && (
                <svg
                  className="size-3 text-indigo-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
