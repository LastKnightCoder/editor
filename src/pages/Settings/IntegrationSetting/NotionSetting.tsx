import React, { useState, useCallback } from "react";
import {
  Card,
  Typography,
  Button,
  Input,
  Modal,
  Form,
  Space,
  Avatar,
  message,
} from "antd";
import {
  UserOutlined,
  LinkOutlined,
  SettingOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import { verifyNotionToken } from "@/commands/notion";

import styles from "./index.module.less";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface NotionCredentialsForm {
  token: string;
}

const NotionSetting: React.FC = () => {
  const { setting, updateNotionToken, updateNotionUserInfo, setNotionEnabled } =
    useSettingStore();
  const { notion } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<NotionCredentialsForm>();

  const checkToken = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const result = await verifyNotionToken(token);

        if (result.success && result.userInfo) {
          updateNotionToken(token);
          updateNotionUserInfo({
            name: result.userInfo.name,
            email: result.userInfo.email,
            avatar: result.userInfo.avatar,
            isConnected: true,
          });
          setNotionEnabled(true);

          message.success("Notion 集成验证成功！");
          setModalOpen(false);
          form.resetFields();
        } else {
          message.error(result.error || "Token 验证失败，请检查是否正确");
        }
      } catch (error) {
        console.error("验证 Notion Token 失败:", error);
        message.error("验证失败，请检查 Token 是否正确");
      } finally {
        setLoading(false);
      }
    },
    [updateNotionToken, updateNotionUserInfo, setNotionEnabled, form],
  );

  const handleDisconnect = useCallback(() => {
    updateNotionToken("");
    updateNotionUserInfo({
      name: "",
      email: "",
      avatar: "",
      isConnected: false,
    });
    setNotionEnabled(false);
    message.success("已断开 Notion 连接");
  }, [updateNotionToken, updateNotionUserInfo, setNotionEnabled]);

  const handleModalOk = useCallback(() => {
    form.validateFields().then((values) => {
      checkToken(values.token);
    });
  }, [form, checkToken]);

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>N</div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              Notion
            </Title>
            <Text type="secondary">Notion</Text>
          </div>

          {notion.userInfo.isConnected && (
            <div className="ml-auto">
              <Space
                direction="vertical"
                size="small"
                style={{ width: "100%" }}
              >
                <Space>
                  <Avatar
                    icon={<UserOutlined />}
                    src={notion.userInfo.avatar || undefined}
                  />
                  <div>
                    <div>{notion.userInfo.name}</div>
                    {notion.userInfo.email && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {notion.userInfo.email}
                      </Text>
                    )}
                  </div>
                </Space>
              </Space>
            </div>
          )}
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${notion.userInfo.isConnected ? styles.connected : styles.disconnected}`}
          />
          <Text type={notion.userInfo.isConnected ? "success" : "secondary"}>
            {notion.userInfo.isConnected ? "已连接" : "未连接"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!notion.userInfo.isConnected ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              连接 Notion
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
        title="Notion 集成"
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
              token: notion.token,
            }}
            onFinish={handleModalOk}
          >
            <Form.Item
              name="token"
              label={
                <Space>
                  <KeyOutlined />
                  <span>集成密钥 (Integration Token)</span>
                </Space>
              }
              rules={[{ required: true, message: "请输入 Notion 集成密钥" }]}
              help={
                <div className="space-y-2 mt-2">
                  <div>1. 访问 https://www.notion.so/my-integrations</div>
                  <div>2. 点击 "New integration" 创建新集成</div>
                  <div>3. 配置集成名称和权限</div>
                  <div>4. 复制 "Internal Integration Token"</div>
                  <div>5. 在 Notion 页面设置中添加该集成</div>
                </div>
              }
            >
              <TextArea
                placeholder="请输入 Notion 集成密钥 (secret_xxx...)..."
                rows={4}
              />
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

export default NotionSetting;
