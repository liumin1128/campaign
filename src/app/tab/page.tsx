"use client";

import { useState } from "react";
import {
  TabList,
  Tab,
  Card,
  CardHeader,
  Text,
  Button,
  Input,
  Badge,
  makeStyles,
  tokens,
  Textarea,
} from "@fluentui/react-components";
import {
  Home24Regular,
  TaskListSquareLtr24Regular,
  Settings24Regular,
  Send24Regular,
} from "@fluentui/react-icons";
import { useTeams, extractUserInfo } from "@/lib/useTeams";

const useStyles = makeStyles({
  container: {
    padding: "20px",
    maxWidth: "800px",
    margin: "0 auto",
  },
  tabContent: {
    marginTop: "20px",
  },
  card: {
    marginBottom: "12px",
    padding: "16px",
  },
  header: {
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxWidth: "400px",
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  banner: {
    padding: "12px",
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: "8px",
    marginBottom: "16px",
  },
});

// ========== 首页视图 ==========
function HomeView({ userName }: { userName: string }) {
  const styles = useStyles();
  return (
    <div>
      <div className={styles.banner}>
        <Text size={400} weight="bold">
          👋 欢迎, {userName || "用户"}!
        </Text>
        <br />
        <Text size={300}>这是你的 Teams 群组 Demo 应用</Text>
      </div>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">快速统计</Text>} />
        <div style={{ display: "flex", gap: "24px", marginTop: "8px" }}>
          <div>
            <Text size={200}>待办任务</Text>
            <br />
            <Badge appearance="filled" color="informative">
              3
            </Badge>
          </div>
          <div>
            <Text size={200}>已完成</Text>
            <br />
            <Badge appearance="filled" color="success">
              5
            </Badge>
          </div>
          <div>
            <Text size={200}>团队成员</Text>
            <br />
            <Badge appearance="filled" color="important">
              8
            </Badge>
          </div>
        </div>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">最近动态</Text>} />
        <Text size={300}>• 张三完成了「UI设计评审」</Text>
        <br />
        <Text size={300}>• 李四创建了新任务「API接口开发」</Text>
        <br />
        <Text size={300}>• 系统自动提醒：周五前提交周报</Text>
      </Card>
    </div>
  );
}

// ========== 任务列表视图 ==========
interface Task {
  id: number;
  title: string;
  done: boolean;
}

function TasksView() {
  const styles = useStyles();
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: "完成 Teams 插件开发", done: false },
    { id: 2, title: "编写接口文档", done: false },
    { id: 3, title: "代码评审", done: true },
  ]);
  const [newTask, setNewTask] = useState("");

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), title: newTask.trim(), done: false },
    ]);
    setNewTask("");
  };

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  return (
    <div>
      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">添加新任务</Text>} />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <Input
            placeholder="输入任务名称..."
            value={newTask}
            onChange={(_, data) => setNewTask(data.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            style={{ flex: 1 }}
          />
          <Button appearance="primary" onClick={addTask}>
            添加
          </Button>
        </div>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">任务列表</Text>} />
        {tasks.map((task) => (
          <div key={task.id} className={styles.taskRow}>
            <Text
              style={{
                textDecoration: task.done ? "line-through" : "none",
                opacity: task.done ? 0.6 : 1,
              }}
            >
              {task.title}
            </Text>
            <Button
              size="small"
              appearance={task.done ? "secondary" : "primary"}
              onClick={() => toggleTask(task.id)}
            >
              {task.done ? "撤销" : "完成"}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ========== 发消息视图（Bot + Webhook 双模式）==========
type SendMode = "bot" | "webhook";

function MessageView() {
  const styles = useStyles();
  const { context } = useTeams();
  const [message, setMessage] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sendMode, setSendMode] = useState<SendMode>("bot");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 从 localStorage 恢复 webhook URL
  useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("teams_webhook_url");
      if (saved) setWebhookUrl(saved);
    }
  });

  const sendMessage = async () => {
    if (!message.trim()) return;
    if (sendMode === "webhook" && !webhookUrl.trim()) return;
    setSending(true);
    setStatus(null);

    if (sendMode === "webhook") {
      localStorage.setItem("teams_webhook_url", webhookUrl);
    }

    try {
      const body: Record<string, string> = { message: message.trim() };
      if (sendMode === "webhook") {
        body.webhookUrl = webhookUrl.trim();
        body.sender = context?.user?.displayName ?? "Unknown";
      }

      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`✅ ${data.message}`);
        setMessage("");
      } else {
        setStatus(`❌ 发送失败: ${data.error}`);
      }
    } catch {
      setStatus("❌ 网络错误，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const canSend = message.trim() && (sendMode === "bot" || webhookUrl.trim());

  return (
    <div>
      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">发送模式</Text>} />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <Button
            appearance={sendMode === "bot" ? "primary" : "secondary"}
            size="small"
            onClick={() => setSendMode("bot")}
          >
            🤖 Bot 主动消息
          </Button>
          <Button
            appearance={sendMode === "webhook" ? "primary" : "secondary"}
            size="small"
            onClick={() => setSendMode("webhook")}
          >
            🔗 Incoming Webhook
          </Button>
        </div>
        <Text size={200} style={{ marginTop: "8px", display: "block" }}>
          {sendMode === "bot"
            ? "通过 Bot Framework 发送。需要先在群组中 @Bot 发送一条消息建立会话。"
            : "通过 Incoming Webhook 发送到频道。需要先在频道中创建 Webhook。"}
        </Text>
      </Card>

      {sendMode === "webhook" && (
        <Card className={styles.card}>
          <CardHeader header={<Text weight="semibold">Webhook 配置</Text>} />
          <div className={styles.form}>
            <Text size={200}>
              频道设置 → Connectors → Incoming Webhook → 创建 → 复制 URL
            </Text>
            <Input
              placeholder="粘贴 Incoming Webhook URL..."
              value={webhookUrl}
              onChange={(_, data) => setWebhookUrl(data.value)}
              type="url"
            />
          </div>
        </Card>
      )}

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">发送消息到群组</Text>} />
        <div className={styles.form}>
          <Textarea
            placeholder="输入要发送给群组的消息..."
            value={message}
            onChange={(_, data) => setMessage(data.value)}
            rows={4}
          />
          <Button
            appearance="primary"
            icon={<Send24Regular />}
            onClick={sendMessage}
            disabled={sending || !canSend}
          >
            {sending ? "发送中..." : "发送到群组"}
          </Button>
          {status && (
            <Text
              size={300}
              style={{ color: status.startsWith("✅") ? "green" : "red" }}
            >
              {status}
            </Text>
          )}
        </div>
      </Card>
    </div>
  );
}

// ========== 主 Tab 页面 ==========
export default function TabPage() {
  const styles = useStyles();
  const { inTeams, context } = useTeams();
  const [activeTab, setActiveTab] = useState("home");

  const userName =
    context?.user?.displayName ?? (inTeams ? "Teams 用户" : "开发者");

  return (
    <div className={styles.container}>
      <Text size={600} weight="bold" className={styles.header} block>
        📋 团队协作 Demo
      </Text>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, data) => setActiveTab(data.value as string)}
      >
        <Tab value="home" icon={<Home24Regular />}>
          首页
        </Tab>
        <Tab value="tasks" icon={<TaskListSquareLtr24Regular />}>
          任务
        </Tab>
        <Tab value="messages" icon={<Send24Regular />}>
          消息
        </Tab>
        <Tab value="settings" icon={<Settings24Regular />}>
          设置
        </Tab>
      </TabList>

      <div className={styles.tabContent}>
        {activeTab === "home" && <HomeView userName={userName} />}
        {activeTab === "tasks" && <TasksView />}
        {activeTab === "messages" && <MessageView />}
        {activeTab === "settings" && <SettingsView />}
      </div>
    </div>
  );
}

// ========== 设置视图（详细用户 & 环境信息）==========
function SettingsView() {
  const styles = useStyles();
  const { inTeams, context } = useTeams();
  const info = extractUserInfo(context);

  const infoItems = [
    { label: "Teams 环境", value: inTeams ? "✅ 是" : "❌ 否（浏览器模式）" },
    { label: "用户名", value: info.displayName },
    { label: "User ID", value: info.userId },
    { label: "UPN (邮箱)", value: info.userPrincipalName },
    { label: "租户 ID", value: info.tenantId },
    { label: "Team ID", value: info.teamId },
    { label: "Team 名称", value: info.teamName },
    { label: "Channel ID", value: info.channelId },
    { label: "Channel 名称", value: info.channelName },
    { label: "Chat ID", value: info.chatId },
    { label: "Group ID", value: info.groupId },
    { label: "语言", value: info.locale },
    { label: "主题", value: info.theme },
    { label: "Session ID", value: info.sessionId },
    { label: "App Host", value: info.appHost },
  ];

  // 同时展示原始 context JSON
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div>
      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">用户 & 环境信息</Text>} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: "4px 12px",
            marginTop: "8px",
          }}
        >
          {infoItems.map((item) => (
            <div key={item.label} style={{ display: "contents" }}>
              <Text
                size={200}
                weight="semibold"
                style={{ color: tokens.colorNeutralForeground3 }}
              >
                {item.label}
              </Text>
              <Text size={200} style={{ wordBreak: "break-all" }}>
                {item.value || "—"}
              </Text>
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">原始 Context</Text>} />
        <Button
          size="small"
          appearance="secondary"
          onClick={() => setShowRaw(!showRaw)}
          style={{ marginBottom: "8px" }}
        >
          {showRaw ? "收起" : "展开"} JSON
        </Button>
        {showRaw && (
          <pre
            style={{
              fontSize: "11px",
              background: tokens.colorNeutralBackground3,
              padding: "12px",
              borderRadius: "6px",
              overflow: "auto",
              maxHeight: "400px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {JSON.stringify(context, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}
