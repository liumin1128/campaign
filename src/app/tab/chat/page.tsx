"use client";

import { useChat } from "@/hooks/use-chat";
import { AgentSelector } from "@/components/chat/agent-selector";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";

export default function ChatPage() {
  const {
    messages,
    input,
    isLoading,
    selectedAgent,
    fileAttachments,
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
  } = useChat();

  const latestAssistantId = messages.findLast(
    (m) => m.role === "assistant",
  )?.id;

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          AI Chat
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          与 AI 助手进行对话 · 支持流式输出
        </p>
      </div>

      {/* Agent selector */}
      <AgentSelector
        selectedAgent={selectedAgent}
        onSelect={setSelectedAgent}
      />

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
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
  );
}
