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
  CloudOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";

import styles from "./index.module.less";

const { Title, Text } = Typography;

interface S3CredentialsForm {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

const S3Setting: React.FC = () => {
  const { setting } = useSettingStore();
  const { s3 } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<S3CredentialsForm>();

  const handleSave = useCallback(() => {
    form.validateFields().then((values) => {
      useSettingStore.setState(
        produce((state) => {
          state.setting.integration.s3 = {
            enabled: true,
            ...values,
          };
        }),
      );
      message.success("S3 凭证已保存！");
      setModalOpen(false);
      form.resetFields();
    });
  }, [form]);

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.s3 = {
          enabled: false,
          accessKeyId: "",
          secretAccessKey: "",
          endpoint: "",
        };
      }),
    );
    message.success("已断开 S3 连接");
  }, []);

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>
            <CloudOutlined />
          </div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              S3 Compatible Storage
            </Title>
            <Text type="secondary">S3 兼容对象存储</Text>
          </div>

          {s3.enabled && (
            <div className="ml-auto">
              <Space direction="vertical" size="small">
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s3.endpoint || "默认端点"}
                  </Text>
                </div>
              </Space>
            </div>
          )}
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${s3.enabled ? styles.connected : styles.disconnected}`}
          />
          <Text type={s3.enabled ? "success" : "secondary"}>
            {s3.enabled ? "已配置" : "未配置"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!s3.enabled ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              配置 S3
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
        title="S3 兼容存储配置"
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
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
              endpoint: s3.endpoint,
            }}
            onFinish={handleSave}
          >
            <Form.Item
              name="accessKeyId"
              label="Access Key ID"
              rules={[{ required: true, message: "请输入 Access Key ID" }]}
            >
              <Input placeholder="请输入 Access Key ID..." />
            </Form.Item>

            <Form.Item
              name="secretAccessKey"
              label="Secret Access Key"
              rules={[{ required: true, message: "请输入 Secret Access Key" }]}
            >
              <Input.Password placeholder="请输入 Secret Access Key..." />
            </Form.Item>

            <Form.Item
              name="endpoint"
              label="Endpoint (可选)"
              help="留空使用 AWS 默认端点，或填入自定义端点 (如: https://s3.us-west-2.amazonaws.com)"
            >
              <Input placeholder="https://..." />
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

export default S3Setting;
