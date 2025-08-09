import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Card,
  Typography,
  Button,
  Input,
  Modal,
  Form,
  Space,
  Avatar,
  Tag,
  message,
  Tabs,
  Spin,
  Alert,
  QRCode,
} from "antd";
import {
  UserOutlined,
  LinkOutlined,
  SettingOutlined,
  QrcodeOutlined,
  KeyOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore";
import {
  getBilibiliQRCode,
  checkBilibiliQRStatus,
  extractCredentialsFromQR,
  checkBilibiliLogin,
  BilibiliQRCodeStatus,
} from "@/utils/bilibili";

import styles from "./index.module.less";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface BilibiliCredentialsForm {
  SESSDATA: string;
  bfe_id?: string;
}

const BilibiliSetting: React.FC = () => {
  const {
    setting,
    updateBilibiliCredentials,
    updateBilibiliUserInfo,
    setBilibiliEnabled,
  } = useSettingStore();
  const { bilibili } = setting.integration;

  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<BilibiliCredentialsForm>();

  // 扫码登录相关状态
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState<{
    qrcodeKey: string;
    url: string;
  } | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("");
  const [qrError, setQrError] = useState<string>("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [qrExpired, setQrExpired] = useState(false);

  // 手动输入凭证验证的函数
  const checkLoginStatus = useCallback(
    async (credentials: BilibiliCredentialsForm) => {
      setLoading(true);
      try {
        // 使用真实的 Bilibili API 检查
        const userInfo = await checkBilibiliLogin(credentials);

        if (userInfo.isLogin) {
          updateBilibiliCredentials(credentials);
          updateBilibiliUserInfo(userInfo);
          setBilibiliEnabled(true);

          message.success("Bilibili 凭证验证成功！");
          setCredentialsModalOpen(false);
          form.resetFields();
        } else {
          message.error("凭证无效，请检查 SESSDATA 是否正确");
        }
      } catch (error) {
        console.error("验证凭证失败:", error);
        message.error("验证失败，请检查凭证是否正确");
      } finally {
        setLoading(false);
      }
    },
    [
      updateBilibiliCredentials,
      updateBilibiliUserInfo,
      setBilibiliEnabled,
      form,
    ],
  );

  // 获取登录二维码
  const getQRCode = useCallback(async () => {
    setQrLoading(true);
    setQrError("");
    setQrExpired(false);

    try {
      const qrInfo = await getBilibiliQRCode();
      setQrData(qrInfo);
      setQrStatus("请使用 Bilibili 手机客户端扫描二维码");

      // 开始轮询二维码状态
      startQRPolling(qrInfo.qrcodeKey);
    } catch (error) {
      console.error("获取二维码失败:", error);
      setQrError("获取二维码失败，请重试");
    } finally {
      setQrLoading(false);
    }
  }, []);

  // 轮询二维码扫描状态
  const startQRPolling = useCallback(
    (qrcodeKey: string) => {
      // 清除之前的轮询
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }

      pollTimerRef.current = setInterval(async () => {
        try {
          const statusResult = await checkBilibiliQRStatus(qrcodeKey);
          console.log("checkBilibiliQRStatus", statusResult);

          switch (statusResult.code) {
            case BilibiliQRCodeStatus.SUCCESS:
              // 登录成功
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }

              if (statusResult.url) {
                try {
                  // 提取登录凭证
                  const credentials = await extractCredentialsFromQR(
                    statusResult.url,
                  );

                  // 验证凭证并获取用户信息
                  const userInfo = await checkBilibiliLogin(credentials);

                  updateBilibiliCredentials(credentials);
                  updateBilibiliUserInfo(userInfo);
                  setBilibiliEnabled(true);

                  setQrStatus("登录成功！");
                  setCredentialsModalOpen(false);
                  setQrData(null);
                  message.success("Bilibili 扫码登录成功！");
                } catch (error) {
                  console.error("处理登录结果失败:", error);
                  setQrError("登录处理失败，请重试");
                }
              }
              break;

            case BilibiliQRCodeStatus.EXPIRED:
              // 二维码过期
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
              setQrExpired(true);
              setQrStatus("二维码已过期，请刷新重试");
              break;

            case BilibiliQRCodeStatus.NOT_CONFIRMED:
              // 已扫码但未确认
              setQrStatus("扫码成功，请在手机上确认登录");
              break;

            case BilibiliQRCodeStatus.NOT_SCANNED:
              // 未扫码，保持当前状态
              break;

            default:
              setQrStatus(statusResult.message || "未知状态");
          }
        } catch (error) {
          console.error("检查二维码状态失败:", error);
          // 不中断轮询，继续尝试
        }
      }, 2000); // 每2秒检查一次
    },
    [updateBilibiliCredentials, updateBilibiliUserInfo, setBilibiliEnabled],
  );

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // 刷新二维码
  const refreshQRCode = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    getQRCode();
  }, [getQRCode]);

  const handleDisconnect = useCallback(() => {
    updateBilibiliCredentials({ SESSDATA: "", bfe_id: "" });
    updateBilibiliUserInfo({
      name: "",
      avatar: "",
      isLogin: false,
      vipStatus: 0,
    });
    setBilibiliEnabled(false);
    message.success("已断开 Bilibili 连接");
  }, [updateBilibiliCredentials, updateBilibiliUserInfo, setBilibiliEnabled]);

  const handleModalOk = useCallback(
    (values?: BilibiliCredentialsForm) => {
      if (values) {
        checkLoginStatus(values);
      } else {
        form.validateFields().then((formValues) => {
          checkLoginStatus(formValues);
        });
      }
    },
    [form, checkLoginStatus],
  );

  const getVipStatusText = (vipStatus: number) => {
    switch (vipStatus) {
      case 0:
        return "普通用户";
      case 1:
        return "大会员";
      default:
        return "未知";
    }
  };

  const getVipStatusColor = (vipStatus: number) => {
    switch (vipStatus) {
      case 0:
        return "blue";
      case 1:
        return "red";
      default:
        return "default";
    }
  };

  return (
    <>
      <Card className={styles.appCard}>
        <div className="flex gap-2 items-center">
          <div className={styles.appIcon}>B</div>

          <div className="flex flex-col">
            <Title level={5} className="mb-0!">
              Bilibili
            </Title>
            <Text type="secondary">哔哩哔哩</Text>
          </div>

          {bilibili.userInfo.isLogin && (
            <div className="ml-auto">
              <Space
                direction="vertical"
                size="small"
                style={{ width: "100%" }}
              >
                <Space>
                  <Avatar
                    icon={<UserOutlined />}
                    src={bilibili.userInfo.avatar}
                  />
                  <div>
                    <div>{bilibili.userInfo.name}</div>
                    <Tag color={getVipStatusColor(bilibili.userInfo.vipStatus)}>
                      {getVipStatusText(bilibili.userInfo.vipStatus)}
                    </Tag>
                  </div>
                </Space>
              </Space>
            </div>
          )}
        </div>

        <div className={styles.appStatus}>
          <div
            className={`${styles.statusDot} ${bilibili.userInfo.isLogin ? styles.connected : styles.disconnected}`}
          />
          <Text type={bilibili.userInfo.isLogin ? "success" : "secondary"}>
            {bilibili.userInfo.isLogin ? "已连接" : "未连接"}
          </Text>
        </div>

        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          {!bilibili.userInfo.isLogin ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => setCredentialsModalOpen(true)}
              block
            >
              连接 Bilibili
            </Button>
          ) : (
            <>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setCredentialsModalOpen(true)}
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
        title="Bilibili 登录"
        open={credentialsModalOpen}
        footer={null}
        onCancel={() => {
          setCredentialsModalOpen(false);
          form.resetFields();
          setQrData(null);
          setQrStatus("");
          setQrError("");
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }}
        width={600}
      >
        <Tabs
          defaultActiveKey="qrcode"
          items={[
            {
              key: "qrcode",
              label: (
                <Space>
                  <QrcodeOutlined />
                  扫码登录
                </Space>
              ),
              children: (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  {!qrData && !qrLoading && (
                    <div>
                      <Button
                        type="primary"
                        icon={<QrcodeOutlined />}
                        onClick={getQRCode}
                        size="large"
                      >
                        获取登录二维码
                      </Button>
                      <div
                        style={{ marginTop: 16, color: "#666", fontSize: 14 }}
                      >
                        使用 Bilibili 手机客户端扫码登录，更安全便捷
                      </div>
                    </div>
                  )}

                  {qrLoading && (
                    <div>
                      <Spin size="large" />
                      <div style={{ marginTop: 16 }}>正在获取二维码...</div>
                    </div>
                  )}

                  {qrData && (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <QRCode
                          value={qrData.url}
                          size={200}
                          style={{
                            border: "1px solid #d9d9d9",
                            borderRadius: "8px",
                            padding: "8px",
                            background: "white",
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <Text>{qrStatus}</Text>
                      </div>

                      {qrExpired && (
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={refreshQRCode}
                          type="primary"
                        >
                          刷新二维码
                        </Button>
                      )}
                    </div>
                  )}

                  {qrError && (
                    <Alert
                      message={qrError}
                      type="error"
                      style={{ marginTop: 16 }}
                      action={
                        <Button size="small" onClick={getQRCode}>
                          重试
                        </Button>
                      }
                    />
                  )}
                </div>
              ),
            },
            {
              key: "manual",
              label: (
                <Space>
                  <KeyOutlined />
                  手动输入
                </Space>
              ),
              children: (
                <div style={{ padding: "20px 0" }}>
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                      SESSDATA: bilibili.credentials.SESSDATA,
                      bfe_id: bilibili.credentials.bfe_id,
                    }}
                    onFinish={handleModalOk}
                    className="space-y-2"
                  >
                    <Form.Item
                      name="SESSDATA"
                      label="SESSDATA"
                      rules={[{ required: true, message: "请输入 SESSDATA" }]}
                      help={
                        <div className="space-y-2">
                          <div>1. 打开 Bilibili 网站并登录</div>
                          <div>2. 按 F12 打开开发者工具</div>
                          <div>3. 切换到 Application/Storage 标签</div>
                          <div>4. 在 Cookies 中找到 SESSDATA 值</div>
                        </div>
                      }
                    >
                      <TextArea placeholder="请输入 SESSDATA..." rows={3} />
                    </Form.Item>

                    <Form.Item
                      name="bfe_id"
                      label="bfe_id (可选)"
                      help="某些情况下需要此值，可从浏览器 Cookies 中获取"
                    >
                      <Input placeholder="请输入 bfe_id..." />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                      <Space>
                        <Button
                          onClick={() => {
                            setCredentialsModalOpen(false);
                            form.resetFields();
                          }}
                        >
                          取消
                        </Button>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={loading}
                        >
                          验证并登录
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default BilibiliSetting;
