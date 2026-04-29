"use client";

import type { AgentOption } from "./types";
import { AGENTS, AGENT_ICONS } from "./constants";

interface AgentSelectorProps {
  selectedAgent: AgentOption;
  onSelect: (agent: AgentOption) => void;
}

export function AgentSelector({ selectedAgent, onSelect }: AgentSelectorProps) {
  return (
    <div className="border-b border-gray-100 py-3 dark:border-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
          Agent:
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {AGENTS.map((agent) => {
          const isSelected = selectedAgent?.id === agent.id;
          const IconComponent = AGENT_ICONS[agent.id];

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent)}
              className={`group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition ${
                isSelected
                  ? "border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-900/20"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
              }`}
            >
              {isSelected && (
                <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                  <svg
                    className="size-3"
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
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}
                >
                  {IconComponent && <IconComponent className="size-4.5" />}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isSelected
                      ? "text-indigo-900 dark:text-indigo-200"
                      : "text-gray-900 dark:text-slate-100"
                  }`}
                >
                  {agent.name}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 line-clamp-2">
                {agent.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
