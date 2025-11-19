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

interface AliOSSCredentialsForm {
  accessKeyId: string;
  accessKeySecret: string;
}

const AliOSSSetting: React.FC = () => {
  const { setting } = useSettingStore();
  const { aliOSS } = setting.integration;

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<AliOSSCredentialsForm>();

  const handleSave = useCallback(() => {
    form.validateFields().then((values) => {
      useSettingStore.setState(
        produce((state) => {
          state.setting.integration.aliOSS = {
            enabled: true,
            ...values,
          };
        }),
      );
      message.success("阿里云 OSS 凭证已保存！");
      setModalOpen(false);
      form.resetFields();
    });
  }, [form]);

  const handleDisconnect = useCallback(() => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.integration.aliOSS = {
          enabled: false,
          accessKeyId: "",
          accessKeySecret: "",
        };
      }),
    );
    message.success("已断开阿里云 OSS 连接");
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
              阿里云 OSS
            </Title>
            <Text type="secondary">阿里云对象存储服务</Text>
          </div>
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${aliOSS.enabled ? styles.connected : styles.disconnected}`}
          />
          <Text type={aliOSS.enabled ? "success" : "secondary"}>
            {aliOSS.enabled ? "已配置" : "未配置"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!aliOSS.enabled ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setModalOpen(true)}
              block
            >
              配置阿里云 OSS
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
        title="阿里云 OSS 配置"
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
              accessKeyId: aliOSS.accessKeyId,
              accessKeySecret: aliOSS.accessKeySecret,
            }}
            onFinish={handleSave}
          >
            <Form.Item
              name="accessKeyId"
              label="Access Key ID"
              rules={[{ required: true, message: "请输入 Access Key ID" }]}
              help={
                <div className="space-y-2 mt-2">
                  <div>1. 访问阿里云控制台</div>
                  <div>2. 进入 AccessKey 管理</div>
                  <div>3. 创建或查看 AccessKey</div>
                </div>
              }
            >
              <Input placeholder="请输入 Access Key ID..." />
            </Form.Item>

            <Form.Item
              name="accessKeySecret"
              label="Access Key Secret"
              rules={[{ required: true, message: "请输入 Access Key Secret" }]}
            >
              <Input.Password placeholder="请输入 Access Key Secret..." />
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

export default AliOSSSetting;
