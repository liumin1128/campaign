# Dev Panel 提示词编辑功能

## 功能概述
在开发者面板中，允许用户实时编辑全局规则和 Agent 系统提示词，本地持久化保存，并自动覆盖硬编码提示词。

## 实现要点

### 1. 存储方案
- 使用 Zustand + `localStorage` 持久化存储用户修改（`prompt-override-store`）
- 状态结构：`{ globalRules: string, agentPrompts: Record<string, string> }`
- `globalRules` 为空字符串时表示使用系统默认
- `agentPrompts` 中不存在的 agentId 表示使用该 agent 的原始提示词

### 2. 覆盖逻辑（`use-chat.ts`）
- 从 store 读取 `overrideGlobalRules` 和 `overrideAgentPrompts`
- 计算生效提示词：`effectiveGlobalRules = overrideGlobalRules || GLOBAL_EMPHASIS`
- 原始 agent 专属提示词通过 `slice(GLOBAL_EMPHASIS.length)` 剥离全局规则前缀
- `effectiveAgentSpecific = overrideAgentPrompts[agentId] ?? originalAgentSpecific`
- 完整 system prompt = `effectiveGlobalRules + effectiveAgentSpecific`
- `buildApiMessages` 使用 `effectiveSystemPrompt` 而非 `selectedAgent.systemPrompt`

### 3. 编辑 UI（`dev-panel.tsx`）
- `EditableField` 组件：展示只读代码块 + 编辑按钮
- 已编辑状态显示琥珀色 "已编辑" 徽标
- 点击编辑 → textarea 出现，保存/取消按钮
- 已编辑字段显示 "重置为默认" 按钮
- 重置会清除 localStorage 中的对应覆盖值

### 4. 状态追踪
- `isGlobalRulesOverridden` / `isAgentPromptOverridden` boolean 从 store 推导
- 通过 `DevPanelProps` 从 `useChat()` 传入 DevPanel

### 5. 注意事项
- "none" agent 没有专属提示词，不显示编辑区域
- agent 切换时自动切换显示的提示词内容
- 编辑保存后，下一次发送消息即使用新提示词（实时生效）
- 语言指令保持只读，不可编辑
