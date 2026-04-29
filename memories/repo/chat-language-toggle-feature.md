# 聊天语言切换功能

## 实现方式
- 在 `types.ts` 中新增 `Language` 类型（`"zh" | "en"`）
- 在 `chat-store.ts` 中添加 `language` 状态和 `setLanguage` 方法，持久化到 sessionStorage
- `ChatInput` 组件底部左侧添加语言切换按钮（"中"/"EN"），点击切换
- `use-chat` hook 中根据 `language` 生成语言指令，注入到 system prompt 中：
  - 中文：`请使用中文回复，除非用户明确要求使用其他语言。`
  - 英文：`Please respond in English, unless the user explicitly asks for another language.`
- 即使 agent 没有 system prompt（如 "none" 代理），也会强制添加语言指令作为 system message

## 关键点
- 语言设置全局生效（不按 session 隔离），降低复杂度
- 语言指令放在 system prompt 末尾，优先级更高
- 使用 `useCallback` 的依赖数组确保 `language` 变化时重新构建 messages
