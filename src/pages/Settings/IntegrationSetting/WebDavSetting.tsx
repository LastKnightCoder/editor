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
  CloudServerOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";

import styles from "./index.module.less";

const { Title, Text } = Typography;

interface WebDavCredentialsForm {
  url: string;
  username: string;
  password: string;
}

const WebDavSetting: React.FC = () => {
  const { setting } = useSettingStore();
  const { webdav } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<WebDavCredentialsForm>();

  const handleSave = useCallback(() => {
    form.validateFields().then((values) => {
      useSettingStore.setState(
        produce((state) => {
          state.setting.integration.webdav = {
            enabled: true,
            ...values,
          };
        }),
      );
      message.success("WebDAV 凭证已保存！");
      setModalOpen(false);
      form.resetFields();
    });
  }, [form]);

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.webdav = {
          enabled: false,
          url: "",
          username: "",
          password: "",
        };
      }),
    );
    message.success("已断开 WebDAV 连接");
  }, []);

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>
            <CloudServerOutlined />
          </div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              WebDAV
            </Title>
            <Text type="secondary">WebDAV 服务器</Text>
          </div>

          {webdav.enabled && (
            <div className="ml-auto">
              <Space direction="vertical" size="small">
                <div>
                  <div>{webdav.username}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {webdav.url}
                  </Text>
                </div>
              </Space>
            </div>
          )}
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${webdav.enabled ? styles.connected : styles.disconnected}`}
          />
          <Text type={webdav.enabled ? "success" : "secondary"}>
            {webdav.enabled ? "已配置" : "未配置"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!webdav.enabled ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              配置 WebDAV
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
        title="WebDAV 配置"
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
              url: webdav.url,
              username: webdav.username,
              password: webdav.password,
            }}
            onFinish={handleSave}
          >
            <Form.Item
              name="url"
              label="WebDAV URL"
              rules={[
                { required: true, message: "请输入 WebDAV URL" },
                { type: "url", message: "请输入有效的 URL" },
              ]}
              help="例如: https://dav.jianguoyun.com/dav/"
            >
              <Input placeholder="https://..." />
            </Form.Item>

            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input placeholder="请输入用户名..." />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password placeholder="请输入密码..." />
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
                <Button type="primary" htmlType="submit">
                  保存
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
};

export default WebDavSetting;
