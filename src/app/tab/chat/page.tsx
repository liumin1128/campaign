"use client";

import { useState, useRef, useEffect } from "react";
import { TextInput } from "flowbite-react";
import { PaperPlane } from "flowbite-react-icons/outline";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const sampleMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "你好！我是 AI 助手，有什么可以帮助你的吗？",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(sampleMessages);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          AI Chat
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          与 AI 助手进行对话
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="[&>input]:rounded-2xl [&>input]:border-gray-300 [&>input]:bg-white [&>input]:py-3 [&>input]:text-sm dark:[&>input]:border-slate-600 dark:[&>input]:bg-slate-800 dark:[&>input]:text-slate-100 dark:[&>input]:placeholder-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            <PaperPlane className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400 dark:text-slate-500">
          AI 回复仅供参考，请核实重要信息
        </p>
      </div>
    </div>
  );
}
