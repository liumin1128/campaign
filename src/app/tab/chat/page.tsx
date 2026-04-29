"use client";

import { useChat } from "@/hooks/use-chat";
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
    sessions,
    activeSessionId,
    messagesEndRef,
    inputRef,
    fileInputRef,
    setInput,
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
    <div className="flex h-[calc(100vh-8rem)]">
      {/* 左侧对话列表 */}
      <SessionSelector
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNew={createSession}
        onSwitch={switchSession}
        onDelete={deleteSession}
        onRename={() => {}}
      />

      {/* 右侧主内容 */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 pb-4 pt-4 dark:border-slate-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
            AI Chat
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            与 AI 助手进行对话 · 支持流式输出
          </p>
        </div>

        {/* Agent selector */}
        <div className="px-6">
          <AgentSelector
            selectedAgent={selectedAgent}
            onSelect={setSelectedAgent}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLatest={msg.id === latestAssistantId}
              isLoading={isLoading}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-6 pb-4">
          <ChatInput
            input={input}
            isLoading={isLoading}
            fileAttachments={fileAttachments}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            onKeyDown={handleKeyDown}
            onFileSelect={handleFileSelect}
            onRemoveFile={handleRemoveFile}
          />
        </div>
      </div>
    </div>
  );
}
