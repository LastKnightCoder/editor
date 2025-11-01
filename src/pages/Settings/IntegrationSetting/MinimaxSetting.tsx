import React, { useState, useCallback } from "react";
import {
  Card,
  Typography,
  Button,
  Input,
  Modal,
  Form,
  Space,
  message,
} from "antd";
import { LinkOutlined, SettingOutlined, KeyOutlined } from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import { chat } from "@/commands";

import styles from "./index.module.less";
import { Role } from "@/constants";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface MinimaxCredentialsForm {
  apiKey: string;
}

const MinimaxSetting: React.FC = () => {
  const { setting, updateMinimaxApiKey, setMinimaxEnabled } = useSettingStore();
  const { minimax } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<MinimaxCredentialsForm>();

  const checkApiKey = useCallback(
    async (apiKey: string) => {
      setLoading(true);

      try {
        // 使用音色列表接口验证 API Key
        const response = await chat(
          apiKey,
          "https://api.minimaxi.com/v1/",
          "MiniMax-M2",
          [
            {
              role: Role.User,
              content: [
                {
                  type: "text",
                  text: "Hello, how are you?",
                },
              ],
            },
          ],
        );
        console.log(response);
        updateMinimaxApiKey(apiKey);
        setMinimaxEnabled(true);
        message.success("Minimax API Key 验证成功！");
        setModalOpen(false);
        form.resetFields();
      } catch (error) {
        console.error("验证 Minimax API Key 失败:", error);
        message.error("验证失败，请检查网络连接");
      } finally {
        setLoading(false);
      }
    },
    [updateMinimaxApiKey, setMinimaxEnabled, form],
  );

  const handleDisconnect = useCallback(() => {
    updateMinimaxApiKey("");
    setMinimaxEnabled(false);
    message.success("已断开 Minimax 连接");
  }, [updateMinimaxApiKey, setMinimaxEnabled]);

  const handleModalOk = useCallback(() => {
    form.validateFields().then((values) => {
      checkApiKey(values.apiKey);
    });
  }, [form, checkApiKey]);

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>M</div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              Minimax
            </Title>
            <Text type="secondary">AI 语音和图像生成</Text>
          </div>
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${minimax.enabled ? styles.connected : styles.disconnected}`}
          />
          <Text type={minimax.enabled ? "success" : "secondary"}>
            {minimax.enabled ? "已连接" : "未连接"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!minimax.enabled ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              连接 Minimax
            </Button>
          ) : (
            <>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setModalOpen(true)}
                block
              >
                管理集成
              </Button>
              <Button danger onClick={handleDisconnect} block>
                断开连接
              </Button>
            </>
          )}
        </Space>
      </Card>

      <Modal
        title="Minimax 集成"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <div style={{ padding: "20px 0" }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              apiKey: minimax.apiKey,
            }}
            onFinish={handleModalOk}
          >
            <Form.Item
              name="apiKey"
              label={
                <Space>
                  <KeyOutlined />
                  <span>API Key</span>
                </Space>
              }
              rules={[{ required: true, message: "请输入 Minimax API Key" }]}
              help={
                <div className="space-y-2 mt-2">
                  <div>1. 访问 https://platform.minimaxi.com</div>
                  <div>2. 登录并进入控制台</div>
                  <div>3. 在 API 管理中创建 API Key</div>
                  <div>4. 复制 API Key 并粘贴到下方</div>
                </div>
              }
            >
              <TextArea placeholder="请输入 Minimax API Key..." rows={4} />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
              <Space>
                <Button
                  onClick={() => {
                    setModalOpen(false);
                    form.resetFields();
                  }}
                >
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                  验证并连接
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
};

export default MinimaxSetting;
