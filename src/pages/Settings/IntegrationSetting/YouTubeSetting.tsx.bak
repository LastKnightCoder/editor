import React from "react";
import { Card, Typography, Space, Input, Form } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import styles from "./index.module.less";

const { Title, Text } = Typography;

const YouTubeSetting: React.FC = () => {
  const { setting, updateYoutubeProxy } = useSettingStore();

  const yt = setting.integration.youtube;

  return (
    <Card className={styles.appCard}>
      <div className="flex gap-2 items-center">
        <div className={styles.appIcon}>Y</div>
        <div className="flex flex-col">
          <Title level={5} className="mb-0!">
            YouTube
          </Title>
          <Text type="secondary">YouTube</Text>
        </div>
      </div>

      <div className={styles.appStatus}>
        <div
          className={`${styles.statusDot} ${yt.enabled ? styles.connected : styles.disconnected}`}
        />
        <Text type={yt.enabled ? "success" : "secondary"}>
          {yt.enabled ? "已连接" : "未连接"}
        </Text>
      </div>

      <Space direction="vertical" className="w-full mt-4" align="start">
        <Form className="w-full">
          <Form.Item label="代理 (http/https)" style={{ marginBottom: 0 }}>
            <Input
              className="w-full"
              placeholder="例如：http://127.0.0.1:7890"
              value={yt.proxy}
              onChange={(e) => updateYoutubeProxy(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Space>
    </Card>
  );
};

export default YouTubeSetting;
