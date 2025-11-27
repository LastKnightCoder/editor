import React, { useState, useCallback } from "react";
import {
  Card,
  Typography,
  Button,
  Space,
  Tag,
  message,
  Modal,
  Input,
} from "antd";
import {
  BookOutlined,
  LoginOutlined,
  DisconnectOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import weReadService from "@/services/weread";

import styles from "./index.module.less";

const { Title, Text } = Typography;
const { TextArea } = Input;

const WeReadSetting: React.FC = () => {
  const { setting, clearWeReadCookies, setWeReadEnabled } = useSettingStore(
    (state) => ({
      setting: state.setting,
      clearWeReadCookies: state.clearWeReadCookies,
      setWeReadEnabled: state.setWeReadEnabled,
    }),
  );

  const { weread } = setting.integration;

  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [cookieInput, setCookieInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleQrLogin = useCallback(async () => {
    setLoading(true);
    try {
      await weReadService.loginWithQRCode();
      message.success("微信读书登录成功");
    } catch (error: any) {
      console.error(error);
      message.error(error?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCookieLogin = useCallback(async () => {
    if (!cookieInput.trim()) {
      message.warning("请输入 Cookie 内容");
      return;
    }
    setLoading(true);
    try {
      await weReadService.loginWithCookieString(cookieInput.trim());
      message.success("Cookie 更新成功");
      setCookieModalOpen(false);
      setCookieInput("");
    } catch (error: any) {
      console.error(error);
      message.error(error?.message || "解析 Cookie 失败");
    } finally {
      setLoading(false);
    }
  }, [cookieInput]);

  const handleDisconnect = useCallback(() => {
    weReadService.logout();
    setWeReadEnabled(false);
    clearWeReadCookies();
    message.success("已断开微信读书连接");
  }, [clearWeReadCookies, setWeReadEnabled]);

  const renderStatus = () => (
    <div className={styles.appStatus}>
      <div
        className={`${styles.statusDot} ${
          weread.userInfo.isConnected ? styles.connected : styles.disconnected
        }`}
      />
      <Text type={weread.userInfo.isConnected ? "success" : "secondary"}>
        {weread.userInfo.isConnected ? "已连接" : "未连接"}
      </Text>
    </div>
  );

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>
            <BookOutlined />
          </div>
          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              微信读书
            </Title>
            <Text type="secondary">同步书籍元数据、划线与想法</Text>
          </div>
          {weread.userInfo.isConnected && (
            <div className="ml-auto">
              <Space direction="vertical" size="small">
                <Space>
                  <Tag color="blue">VID: {weread.userInfo.vid}</Tag>
                  <Text>{weread.userInfo.name}</Text>
                </Space>
              </Space>
            </div>
          )}
        </div>

        {renderStatus()}

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!weread.userInfo.isConnected ? (
            <>
              <Button
                type="primary"
                icon={<LoginOutlined />}
                block
                loading={loading}
                onClick={handleQrLogin}
              >
                扫码登录
              </Button>
              <Button
                block
                onClick={() => setCookieModalOpen(true)}
                loading={loading}
              >
                手动输入 Cookie
              </Button>
            </>
          ) : (
            <>
              <Button block onClick={handleQrLogin} loading={loading}>
                重新扫码登录
              </Button>
              <Button
                danger
                block
                icon={<DisconnectOutlined />}
                onClick={handleDisconnect}
              >
                断开连接
              </Button>
            </>
          )}
        </Space>
      </Card>

      <Modal
        title="手动输入 Cookie"
        open={cookieModalOpen}
        okText="保存"
        confirmLoading={loading}
        onOk={handleCookieLogin}
        onCancel={() => {
          setCookieModalOpen(false);
          setCookieInput("");
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text type="secondary">
            在浏览器中打开{" "}
            <a href="https://weread.qq.com" target="_blank" rel="noreferrer">
              https://weread.qq.com
            </a>{" "}
            并登录，打开开发者工具复制请求头中的 Cookie
          </Text>
          <TextArea
            rows={4}
            value={cookieInput}
            onChange={(event) => setCookieInput(event.target.value)}
            placeholder="例如：wr_name=xxx; wr_vid=xxx; wr_skey=xxx"
          />
        </Space>
      </Modal>
    </>
  );
};

export default WeReadSetting;
