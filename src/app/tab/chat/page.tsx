"use client";

import { useChat } from "@/hooks/use-chat";
import { t } from "@/components/chat/i18n";
import { AgentSelector } from "@/components/chat/agent-selector";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { SessionSelector } from "@/components/chat/session-selector";

export default function ChatPage() {
  const {
    messages,
    input,
    isLoading,
    selectedAgent,
    fileAttachments,
    language,
    sessions,
    activeSessionId,
    messagesEndRef,
    inputRef,
    fileInputRef,
    setInput,
    setLanguage,
    setSelectedAgent,
    handleSend,
    handleStop,
    handleKeyDown,
    handleFileSelect,
    handleRemoveFile,
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
      <div className="flex flex-1 flex-col min-w-0">
        {/* Agent selector — 紧凑一行 */}
        <div className="shrink-0 border-b border-gray-100 dark:border-slate-800">
          <AgentSelector
            selectedAgent={selectedAgent}
            language={language}
            onSelect={setSelectedAgent}
          />
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
            fileAttachments={fileAttachments}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            onKeyDown={handleKeyDown}
            onFileSelect={handleFileSelect}
            onRemoveFile={handleRemoveFile}
            onLanguageChange={setLanguage}
          />
        </div>
      </div>
    </div>
  );
}
