"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Code, Messages } from "flowbite-react-icons/outline";
import { useChat } from "@/hooks/use-chat";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { AgentSelector } from "@/components/chat/agent-selector";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { SessionSelector } from "@/components/chat/session-selector";
import { DevPanel } from "@/components/chat/dev-panel";
import { t } from "@/components/chat/i18n";

export default function ChatPage() {
  const {
    messages,
    input,
    isLoading,
    isPreparingAttachments,
    loadingSessionIds,
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
    memoryEnabled,
    memoryItems,
    lastUsedMemoryIds,
    setMemoryEnabled,
    removeMemory,
    clearMemories,
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
    renameSession,
  } = useChat();
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);

  const latestAssistantId = messages.findLast(
    (message) => message.role === "assistant",
  )?.id;
  const latestMessage = messages.at(-1);
  const messageKey = [
    messages.length,
    latestMessage?.id,
    latestMessage?.content.length,
    latestMessage?.reasoning?.length,
  ].join(":");
  const {
    containerRef,
    endRef,
    showJumpToLatest,
    handleScroll,
    scrollToLatest,
  } = useChatScroll(session?.id, messageKey);

  useEffect(() => {
    if (!sessionPanelOpen && !devMode) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (devMode) toggleDevMode();
      else setSessionPanelOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [devMode, sessionPanelOpen, toggleDevMode]);

  function handleCreateSession() {
    const createdId = createSession();
    if (createdId) setSessionPanelOpen(false);
  }

  function handleSwitchSession(sessionId: string) {
    switchSession(sessionId);
    setSessionPanelOpen(false);
  }

  const sessionSelector = (
    <SessionSelector
      sessions={sessions}
      activeSessionId={activeSessionId}
      loadingSessionIds={loadingSessionIds}
      language={language}
      onNew={handleCreateSession}
      onSwitch={handleSwitchSession}
      onDelete={deleteSession}
      onRename={renameSession}
      onClose={() => setSessionPanelOpen(false)}
    />
  );

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden bg-slate-50/70 lg:h-dvh dark:bg-slate-950/70">
      <div className="hidden w-60 shrink-0 md:block">{sessionSelector}</div>

      {sessionPanelOpen && (
        <div
          className="absolute inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t(language, "session_title")}
        >
          <button
            type="button"
            onClick={() => setSessionPanelOpen(false)}
            aria-label={t(language, "session_close")}
            className="absolute inset-0 bg-slate-950/40"
          />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] shadow-2xl">
            {sessionSelector}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-white/80 pr-2 dark:border-slate-800 dark:bg-slate-950/80">
            <button
              type="button"
              onClick={() => {
                if (devMode) toggleDevMode();
                setSessionPanelOpen(true);
              }}
              aria-label={t(language, "session_open")}
              title={t(language, "session_open")}
              className="ml-2 flex size-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Messages aria-hidden="true" className="size-5" />
            </button>
            <AgentSelector
              selectedAgent={selectedAgent}
              language={language}
              disabled={isLoading}
              onSelect={setSelectedAgent}
            />
            <button
              type="button"
              onClick={() => {
                setSessionPanelOpen(false);
                toggleDevMode();
              }}
              aria-pressed={devMode}
              aria-label={t(language, "dev_mode_toggle")}
              title={t(language, "dev_mode_toggle")}
              className={`flex size-9 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                devMode
                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Code aria-hidden="true" className="size-4" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={containerRef}
              onScroll={handleScroll}
              role="log"
              aria-live="polite"
              aria-busy={isLoading}
              aria-relevant="additions text"
              className="h-full overflow-y-auto overscroll-contain"
            >
              <div className="mx-auto w-full max-w-4xl space-y-3 px-3 py-4 sm:px-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isLatest={message.id === latestAssistantId}
                    isLoading={isLoading}
                    language={language}
                    sessionId={activeSessionId ?? ""}
                    sessionTitle={session?.title ?? ""}
                    quotedMessages={quotedMessages}
                    onToggleQuote={toggleQuotedMessage}
                  />
                ))}
                <div ref={endRef} aria-hidden="true" />
              </div>
            </div>

            {showJumpToLatest && (
              <button
                type="button"
                onClick={() => scrollToLatest()}
                aria-label={t(language, "scroll_latest")}
                title={t(language, "scroll_latest")}
                className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80">
            <ChatInput
              input={input}
              isLoading={isLoading}
              isPreparingAttachments={isPreparingAttachments}
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
                const message = quotedMessages.find((quote) => quote.id === id);
                if (message) toggleQuotedMessage(message);
              }}
            />
          </div>
        </div>

        {devMode && (
          <>
            <button
              type="button"
              onClick={toggleDevMode}
              aria-label={t(language, "dev_mode_close")}
              className="absolute inset-0 z-40 bg-slate-950/30 2xl:hidden"
            />
            <div
              className="absolute inset-y-0 right-0 z-50 w-[min(24rem,100%)] shadow-2xl 2xl:static 2xl:z-auto 2xl:w-96 2xl:shrink-0 2xl:shadow-none"
              role="complementary"
              aria-label={t(language, "dev_mode_title")}
            >
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
                memory={{
                  enabled: memoryEnabled,
                  items: memoryItems,
                  usedMemoryIds: lastUsedMemoryIds,
                  onEnabledChange: setMemoryEnabled,
                  onDelete: removeMemory,
                  onClear: clearMemories,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
