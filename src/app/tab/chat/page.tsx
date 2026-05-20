"use client";

import { useChat } from "@/hooks/use-chat";
import { AgentSelector } from "@/components/chat/agent-selector";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { SessionSelector } from "@/components/chat/session-selector";
import { DevPanel } from "@/components/chat/dev-panel";
import { t } from "@/components/chat/i18n";
import { Code } from "flowbite-react-icons/outline";

export default function ChatPage() {
  const {
    messages,
    input,
    isLoading,
    selectedAgent,
    fileAttachments,
    language,
    enableThinking,
    sessions,
    activeSessionId,
    session,
    quotedMessages,
    devMode,
    toggleDevMode,
    apiMessages,
    fullSystemPrompt,
    agentPrompt,
    globalRules,
    langInstruction,
    isGlobalRulesOverridden,
    isAgentPromptOverridden,
    messagesEndRef,
    inputRef,
    fileInputRef,
    largeCsvInputRef,
    setInput,
    setLanguage,
    setEnableThinking,
    setSelectedAgent,
    handleSend,
    handleStop,
    handleKeyDown,
    handleFileSelect,
    handleLargeCsvSelect,
    handleRemoveFile,
    toggleQuotedMessage,
    createSession,
    switchSession,
    deleteSession,
  } = useChat();

  const latestAssistantId = messages.findLast(
    (m) => m.role === "assistant",
  )?.id;

  return (
    <div className="flex h-screen">
      {/* 左侧对话列表 */}
      <SessionSelector
        sessions={sessions}
        activeSessionId={activeSessionId}
        language={language}
        onNew={createSession}
        onSwitch={switchSession}
        onDelete={deleteSession}
        onRename={() => {}}
      />

      {/* 右侧主内容 */}
      <div className="flex flex-1 min-w-0">
        <div className="flex flex-1 flex-col min-w-0">
          {/* Agent selector — 紧凑一行 */}
          <div className="shrink-0 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between pr-2">
              <AgentSelector
                selectedAgent={selectedAgent}
                language={language}
                onSelect={setSelectedAgent}
              />
              {/* 开发者模式开关 */}
              <button
                type="button"
                onClick={toggleDevMode}
                title={t(language, "dev_mode_toggle")}
                className={`rounded-md p-1.5 transition ${
                  devMode
                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <Code className="size-4" />
              </button>
            </div>
          </div>

          {/* Messages — 紧贴左侧 */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLatest={msg.id === latestAssistantId}
                isLoading={isLoading}
                language={language}
                sessionId={activeSessionId ?? ""}
                sessionTitle={session?.title ?? ""}
                quotedMessages={quotedMessages}
                onToggleQuote={toggleQuotedMessage}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area — 紧贴底部 */}
          <div className="shrink-0 border-t border-gray-100 dark:border-slate-800">
            <ChatInput
              input={input}
              isLoading={isLoading}
              language={language}
              enableThinking={enableThinking}
              fileAttachments={fileAttachments}
              quotedMessages={quotedMessages}
              inputRef={inputRef}
              fileInputRef={fileInputRef}
              largeCsvInputRef={largeCsvInputRef}
              onInputChange={setInput}
              onSend={handleSend}
              onStop={handleStop}
              onKeyDown={handleKeyDown}
              onFileSelect={handleFileSelect}
              onLargeCsvSelect={handleLargeCsvSelect}
              onRemoveFile={handleRemoveFile}
              onLanguageChange={setLanguage}
              onThinkingChange={setEnableThinking}
              onRemoveQuote={(id) => {
                const msg = quotedMessages.find((q) => q.id === id);
                if (msg) toggleQuotedMessage(msg);
              }}
            />
          </div>
        </div>

        {/* 开发者面板 — 右侧 */}
        {devMode && (
          <DevPanel
            isOpen={devMode}
            onClose={toggleDevMode}
            data={{
              systemPrompt: fullSystemPrompt,
              globalRules,
              langInstruction,
              agentPrompt,
              apiMessages,
              messages,
              agentId: selectedAgent.id,
              agentName: selectedAgent.name,
            }}
            language={language}
            isGlobalRulesOverridden={isGlobalRulesOverridden}
            isAgentPromptOverridden={isAgentPromptOverridden}
          />
        )}
      </div>
    </div>
  );
}
