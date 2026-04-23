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
import { useTeams } from "@/lib/useTeams";

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

// ========== 发消息视图（触发自动化消息） ==========
function MessageView() {
  const styles = useStyles();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
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

  return (
    <div>
      <Card className={styles.card}>
        <CardHeader
          header={<Text weight="semibold">向群组发送自动化消息</Text>}
        />
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
            disabled={sending || !message.trim()}
          >
            {sending ? "发送中..." : "发送到群组"}
          </Button>
          {status && (
            <Text
              size={300}
              style={{
                color: status.startsWith("✅") ? "green" : "red",
              }}
            >
              {status}
            </Text>
          )}
        </div>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">自动化规则</Text>} />
        <Text size={300}>
          💡 提示：可以配置定时任务，让 Bot 自动向群组发送提醒消息。
        </Text>
        <br />
        <Text size={300}>当前已配置的规则：</Text>
        <br />
        <Text size={300}>• 每日 9:00 发送站会提醒</Text>
        <br />
        <Text size={300}>• 每周五 17:00 发送周报提醒</Text>
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

// ========== 设置视图 ==========
function SettingsView() {
  const styles = useStyles();
  const { inTeams, context } = useTeams();

  return (
    <div>
      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">应用信息</Text>} />
        <Text size={300}>
          Teams 环境: {inTeams ? "✅ 是" : "❌ 否（浏览器模式）"}
        </Text>
        <br />
        <Text size={300}>用户: {context?.user?.displayName ?? "未知"}</Text>
        <br />
        <Text size={300}>租户 ID: {context?.user?.tenant?.id ?? "未知"}</Text>
        <br />
        <Text size={300}>频道: {context?.channel?.displayName ?? "N/A"}</Text>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Text weight="semibold">Bot 配置</Text>} />
        <div className={styles.form}>
          <Input
            placeholder="Bot ID"
            defaultValue={process.env.NEXT_PUBLIC_BOT_ID ?? ""}
          />
          <Text size={200}>
            在 Azure Bot Service 中注册你的 Bot 以启用主动消息功能。
          </Text>
        </div>
      </Card>
    </div>
  );
}
