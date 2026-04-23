"use client";

import { useEffect } from "react";
import * as microsoftTeams from "@microsoft/teams-js";
import {
  Button,
  Text,
  Card,
  CardHeader,
  makeStyles,
} from "@fluentui/react-components";
import { TeamsProvider } from "@/lib/TeamsProvider";

const useStyles = makeStyles({
  container: {
    padding: "20px",
    maxWidth: "500px",
    margin: "0 auto",
  },
  card: {
    padding: "16px",
  },
});

export default function TabConfigPage() {
  const styles = useStyles();

  useEffect(() => {
    const init = async () => {
      try {
        await microsoftTeams.app.initialize();
        microsoftTeams.pages.config.registerOnSaveHandler((saveEvent) => {
          microsoftTeams.pages.config.setConfig({
            entityId: "teamDemo",
            contentUrl: `${window.location.origin}/tab`,
            suggestedDisplayName: "团队协作 Demo",
          });
          saveEvent.notifySuccess();
        });
        microsoftTeams.pages.config.setValidityState(true);
      } catch {
        // 不在 Teams 环境中，忽略
      }
    };
    init();
  }, []);

  return (
    <TeamsProvider>
      <div className={styles.container}>
        <Card className={styles.card}>
          <CardHeader header={<Text weight="semibold">配置 Tab</Text>} />
          <Text size={300}>点击「保存」将此 Tab 添加到你的频道或群聊中。</Text>
          <br />
          <br />
          <Text size={200}>
            Tab 将展示团队协作面板，包含首页、任务管理、消息发送等功能。
          </Text>
          <br />
          <br />
          <Button
            appearance="primary"
            onClick={() => {
              microsoftTeams.pages.config.setValidityState(true);
            }}
          >
            确认配置
          </Button>
        </Card>
      </div>
    </TeamsProvider>
  );
}
