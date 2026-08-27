"use client";

import type { AgentOption, Language } from "./types";
import { AGENT_ICONS } from "./constants";
import { getLocalizedAgents, t } from "./i18n";
import { Check } from "flowbite-react-icons/outline";

interface AgentSelectorProps {
  selectedAgent: AgentOption;
  language: Language;
  disabled?: boolean;
  onSelect: (agent: AgentOption) => void;
}

export function AgentSelector({
  selectedAgent,
  language,
  disabled = false,
  onSelect,
}: AgentSelectorProps) {
  const agents = getLocalizedAgents(language);

  return (
    <div className="min-w-0 flex-1 px-2 py-2 sm:px-4">
      <label className="block md:hidden">
        <span className="sr-only">{t(language, "agent_select_label")}</span>
        <select
          value={selectedAgent.id}
          disabled={disabled}
          onChange={(event) => {
            const agent = agents.find((item) => item.id === event.target.value);
            if (agent) onSelect(agent);
          }}
          className="h-9 w-full max-w-52 rounded-md border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-900"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <div
        role="group"
        aria-label={t(language, "agent_select_label")}
        className="hidden min-w-0 items-center gap-2 overflow-x-auto md:flex"
      >
        {agents.map((agent) => {
          const isSelected = selectedAgent?.id === agent.id;
          const IconComponent = AGENT_ICONS[agent.id];

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent)}
              disabled={disabled}
              aria-pressed={isSelected}
              title={agent.description}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
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
                {IconComponent && (
                  <IconComponent aria-hidden="true" className="size-3.5" />
                )}
              </div>
              <span>{agent.name}</span>
              {isSelected && (
                <Check aria-hidden="true" className="size-3 text-indigo-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
