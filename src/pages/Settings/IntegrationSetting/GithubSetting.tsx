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
import {
  LinkOutlined,
  SettingOutlined,
  GithubOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";
import { getGithubUserInfo } from "@/utils";

import styles from "./index.module.less";

const { Title, Text } = Typography;

interface GithubCredentialsForm {
  token: string;
}

const GithubSetting: React.FC = () => {
  const { setting } = useSettingStore();
  const { github } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<GithubCredentialsForm>();

  const checkToken = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const userInfo = await getGithubUserInfo(token);

        if (userInfo) {
          const { login, email } = userInfo;
          useSettingStore.setState(
            produce((state) => {
              state.setting.integration.github.token = token;
              state.setting.integration.github.user = {
                name: login,
                email: email || "",
              };
              state.setting.integration.github.enabled = true;
            }),
          );

          message.success("Github 集成验证成功！");
          setModalOpen(false);
          form.resetFields();
        } else {
          message.error("Token 验证失败，请检查是否正确");
        }
      } catch (error) {
        console.error("验证 Github Token 失败:", error);
        message.error("验证失败，请检查 Token 是否正确");
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.github.token = "";
        state.setting.integration.github.user = { name: "", email: "" };
        state.setting.integration.github.enabled = false;
      }),
    );
    message.success("已断开 Github 连接");
  }, []);

  const handleModalOk = useCallback(() => {
    form.validateFields().then((values) => {
      checkToken(values.token);
    });
  }, [form, checkToken]);

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>
            <GithubOutlined />
          </div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              Github
            </Title>
            <Text type="secondary">代码托管平台</Text>
          </div>

          {github.enabled && github.user.name && (
            <div className="ml-auto">
              <Space direction="vertical" size="small">
                <div>
                  <div>{github.user.name}</div>
                  {github.user.email && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {github.user.email}
                    </Text>
                  )}
                </div>
              </Space>
            </div>
          )}
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${github.enabled ? styles.connected : styles.disconnected}`}
          />
          <Text type={github.enabled ? "success" : "secondary"}>
            {github.enabled ? "已连接" : "未连接"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!github.enabled ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              连接 Github
            </Button>
          ) : (
            <>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setModalOpen(true)}
                block
              >
                管理凭证
              </Button>
              <Button danger onClick={handleDisconnect} block>
                断开连接
              </Button>
            </>
          )}
        </Space>
      </Card>

      <Modal
        title="Github 集成"
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
              token: github.token,
            }}
            onFinish={handleModalOk}
          >
            <Form.Item
              name="token"
              label="Personal Access Token"
              rules={[{ required: true, message: "请输入 Github Token" }]}
              help={
                <div className="space-y-2 mt-2">
                  <div>1. 访问 https://github.com/settings/tokens</div>
                  <div>2. 点击 "Generate new token (classic)"</div>
                  <div>3. 勾选 repo 权限</div>
                  <div>4. 生成并复制 Token</div>
                </div>
              }
            >
              <Input.TextArea
                placeholder="请输入 Github Personal Access Token..."
                rows={3}
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

export default GithubSetting;
