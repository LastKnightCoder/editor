import { useEffect, useState } from "react";
import type { SettingCompat } from "../../../types";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import * as tauri from "../../../services/tauri";
import type { SettingModule, SettingsPageProps } from "./types";
import { FieldInput, IconCloud, ListItem } from "./ui";

type UpdateSetting = SettingsPageProps["updateSetting"];

type IntegrationCommonProps = {
  safeSetting: SettingCompat | null;
  isSavingSetting: boolean;
  onSaveSetting: () => Promise<void>;
  updateSetting: UpdateSetting;
};

type Feedback = {
  type: "success" | "error";
  text: string;
};

function FeedbackView(props: { feedback: Feedback | null }) {
  if (!props.feedback) return null;
  return (
    <div
      className={`rounded-lg p-3 text-sm ${
        props.feedback.type === "success"
          ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
          : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
      }`}
    >
      {props.feedback.text}
    </div>
  );
}

function resolveErrorMessage(error: unknown, fallback: string) {
  const parsed = parseInvokeError(error);
  const baseMessage = mapErrorToMessage(
    parsed.code,
    parsed.message || fallback,
  );
  const detailMessage =
    parsed.message && parsed.message !== parsed.code ? parsed.message : "";
  if (detailMessage && detailMessage !== baseMessage) {
    return `${baseMessage}（${detailMessage}）`;
  }
  return baseMessage;
}

async function saveAfterStateSettled(onSaveSetting: () => Promise<void>) {
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 0);
  });
  await onSaveSetting();
}

export function IntegrationHomeSection(props: {
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
}) {
  return (
    <div className="list-group">
      <ListItem
        icon={<IconCloud />}
        label="Github 账号"
        onClick={() => props.onOpenModule("integration-github")}
      />
      <ListItem
        icon={<IconCloud />}
        label="S3 账号"
        onClick={() => props.onOpenModule("integration-s3")}
      />
      <ListItem
        icon={<IconCloud />}
        label="WebDAV 账号"
        onClick={() => props.onOpenModule("integration-webdav")}
      />
      <ListItem
        icon={<IconCloud />}
        label="AliOSS 账号"
        onClick={() => props.onOpenModule("integration-alioss")}
      />
    </div>
  );
}

export function IntegrationGithubSection(props: IntegrationCommonProps) {
  const [tokenValue, setTokenValue] = useState(
    props.safeSetting?.integration.github.token ?? "",
  );
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const connectedName = props.safeSetting?.integration.github.user.name ?? "";
  const connectedEmail = props.safeSetting?.integration.github.user.email ?? "";
  const isConnected = Boolean(
    props.safeSetting?.integration.github.token && connectedName,
  );

  useEffect(() => {
    setTokenValue(props.safeSetting?.integration.github.token ?? "");
  }, [props.safeSetting?.integration.github.token]);

  const handleVerifyAndSave = async () => {
    const token = tokenValue.trim();
    if (!token) {
      setFeedback({ type: "error", text: "请输入 Github Token" });
      return;
    }
    setIsVerifying(true);
    setFeedback(null);
    try {
      const profile = await tauri.verifyGithubToken(token);
      props.updateSetting((prev) => ({
        ...prev,
        integration: {
          ...prev.integration,
          github: {
            ...prev.integration.github,
            token,
            user: {
              name: profile.name,
              email: profile.email,
            },
          },
        },
      }));
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({
        type: "success",
        text: `验证成功，已连接账号 ${profile.name} 并保存配置`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "Github 验证失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setIsVerifying(true);
    setFeedback(null);
    props.updateSetting((prev) => ({
      ...prev,
      integration: {
        ...prev.integration,
        github: {
          ...prev.integration.github,
          token: "",
          user: {
            name: "",
            email: "",
          },
        },
      },
    }));
    try {
      await saveAfterStateSettled(props.onSaveSetting);
      setTokenValue("");
      setFeedback({ type: "success", text: "已断开 Github 并保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "断开 Github 失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="list-group p-4">
      <div className="space-y-3">
        <FieldInput
          label="Token"
          value={tokenValue}
          onChange={(v) => {
            setTokenValue(v);
            setFeedback(null);
          }}
          placeholder="ghp_xxx"
          type="password"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          只需输入 Token，点击“验证并连接”后会自动获取用户名与邮箱。
        </p>
        {isConnected && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <div>已连接账号：{connectedName}</div>
            {connectedEmail ? <div>邮箱：{connectedEmail}</div> : null}
          </div>
        )}
        <FeedbackView feedback={feedback} />
        <button
          type="button"
          onClick={() => void handleVerifyAndSave()}
          disabled={!tokenValue.trim() || isVerifying || props.isSavingSetting}
          className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {isVerifying
            ? "验证中..."
            : props.isSavingSetting
              ? "保存中..."
              : "验证并保存"}
        </button>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg border border-red-300 py-3 text-sm font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
        >
          断开连接
        </button>
      </div>
    </div>
  );
}

export function IntegrationS3Section(props: IntegrationCommonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const urlStyle = props.safeSetting?.integration.s3.urlStyle ?? "path";
  const accessKeyId = props.safeSetting?.integration.s3.accessKeyId ?? "";
  const secretAccessKey =
    props.safeSetting?.integration.s3.secretAccessKey ?? "";
  const endpoint = props.safeSetting?.integration.s3.endpoint ?? "";
  const bucket =
    props.safeSetting?.sync.s3.bucket ||
    props.safeSetting?.imageBed.s3.bucket ||
    "";
  const region =
    props.safeSetting?.sync.s3.region ||
    props.safeSetting?.imageBed.s3.region ||
    "";

  const handleVerifyAndSave = async () => {
    setIsVerifying(true);
    setFeedback(null);
    try {
      await tauri.verifyS3Credentials({
        accessKeyId,
        secretAccessKey,
        endpoint,
        urlStyle,
        bucket,
        region,
      });
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "S3 验证成功并已保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "S3 验证失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setIsVerifying(true);
    setFeedback(null);
    props.updateSetting((prev) => ({
      ...prev,
      integration: {
        ...prev.integration,
        s3: {
          ...prev.integration.s3,
          accessKeyId: "",
          secretAccessKey: "",
          endpoint: "",
          urlStyle: "path",
        },
      },
    }));
    try {
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "已断开 S3 并保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "断开 S3 失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="list-group p-4">
      <div className="space-y-3">
        <FieldInput
          label="AccessKeyId"
          value={props.safeSetting?.integration.s3.accessKeyId ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                s3: { ...prev.integration.s3, accessKeyId: v },
              },
            }))
          }
          placeholder="AccessKeyId"
        />
        <FieldInput
          label="SecretAccessKey"
          value={props.safeSetting?.integration.s3.secretAccessKey ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                s3: { ...prev.integration.s3, secretAccessKey: v },
              },
            }))
          }
          placeholder="SecretAccessKey"
          type="password"
        />
        <FieldInput
          label="Endpoint"
          value={props.safeSetting?.integration.s3.endpoint ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                s3: { ...prev.integration.s3, endpoint: v },
              },
            }))
          }
          placeholder="https://s3.ap-southeast-1.amazonaws.com"
        />
        <div>
          <label className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400">
            URL 风格
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                props.updateSetting((prev) => ({
                  ...prev,
                  integration: {
                    ...prev.integration,
                    s3: { ...prev.integration.s3, urlStyle: "path" },
                  },
                }))
              }
              className={`rounded-lg border px-3 py-2 text-sm ${
                urlStyle === "path"
                  ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30"
                  : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
              }`}
            >
              path
            </button>
            <button
              type="button"
              onClick={() =>
                props.updateSetting((prev) => ({
                  ...prev,
                  integration: {
                    ...prev.integration,
                    s3: { ...prev.integration.s3, urlStyle: "virtualHosted" },
                  },
                }))
              }
              className={`rounded-lg border px-3 py-2 text-sm ${
                urlStyle === "virtualHosted"
                  ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30"
                  : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
              }`}
            >
              virtualHosted
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          验证会使用当前同步/资源配置中的 Bucket 与 Region（当前：
          {bucket || "-"} / {region || "-"}）。
        </p>
        <FeedbackView feedback={feedback} />
        <button
          type="button"
          onClick={() => void handleVerifyAndSave()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {isVerifying
            ? "验证中..."
            : props.isSavingSetting
              ? "保存中..."
              : "验证并保存"}
        </button>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg border border-red-300 py-3 text-sm font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
        >
          断开连接
        </button>
      </div>
    </div>
  );
}

export function IntegrationWebDavSection(props: IntegrationCommonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const url = props.safeSetting?.integration.webdav.url ?? "";
  const username = props.safeSetting?.integration.webdav.username ?? "";
  const password = props.safeSetting?.integration.webdav.password ?? "";

  const handleVerifyAndSave = async () => {
    setIsVerifying(true);
    setFeedback(null);
    try {
      await tauri.verifyWebdavCredentials({
        url,
        username,
        password,
      });
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "WebDAV 验证成功并已保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "WebDAV 验证失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setIsVerifying(true);
    setFeedback(null);
    props.updateSetting((prev) => ({
      ...prev,
      integration: {
        ...prev.integration,
        webdav: {
          ...prev.integration.webdav,
          url: "",
          username: "",
          password: "",
        },
      },
    }));
    try {
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "已断开 WebDAV 并保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "断开 WebDAV 失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="list-group p-4">
      <div className="space-y-3">
        <FieldInput
          label="服务器地址"
          value={props.safeSetting?.integration.webdav.url ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                webdav: { ...prev.integration.webdav, url: v },
              },
            }))
          }
          placeholder="https://example.com/dav"
        />
        <FieldInput
          label="用户名"
          value={props.safeSetting?.integration.webdav.username ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                webdav: { ...prev.integration.webdav, username: v },
              },
            }))
          }
          placeholder="用户名"
        />
        <FieldInput
          label="密码"
          value={props.safeSetting?.integration.webdav.password ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                webdav: { ...prev.integration.webdav, password: v },
              },
            }))
          }
          placeholder="密码"
          type="password"
        />
        <FeedbackView feedback={feedback} />
        <button
          type="button"
          onClick={() => void handleVerifyAndSave()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {isVerifying
            ? "验证中..."
            : props.isSavingSetting
              ? "保存中..."
              : "验证并保存"}
        </button>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg border border-red-300 py-3 text-sm font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
        >
          断开连接
        </button>
      </div>
    </div>
  );
}

export function IntegrationAliOssSection(props: IntegrationCommonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const accessKeyId = props.safeSetting?.integration.aliOSS.accessKeyId ?? "";
  const accessKeySecret =
    props.safeSetting?.integration.aliOSS.accessKeySecret ?? "";
  const bucket =
    props.safeSetting?.sync.aliOSS.bucket ||
    props.safeSetting?.imageBed.aliOSS.bucket ||
    "";
  const region =
    props.safeSetting?.sync.aliOSS.region ||
    props.safeSetting?.imageBed.aliOSS.region ||
    "";

  const handleVerifyAndSave = async () => {
    setIsVerifying(true);
    setFeedback(null);
    try {
      await tauri.verifyAliOssCredentials({
        accessKeyId,
        accessKeySecret,
        bucket,
        region,
      });
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "AliOSS 验证成功并已保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "AliOSS 验证失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setIsVerifying(true);
    setFeedback(null);
    props.updateSetting((prev) => ({
      ...prev,
      integration: {
        ...prev.integration,
        aliOSS: {
          ...prev.integration.aliOSS,
          accessKeyId: "",
          accessKeySecret: "",
        },
      },
    }));
    try {
      await saveAfterStateSettled(props.onSaveSetting);
      setFeedback({ type: "success", text: "已断开 AliOSS 并保存配置" });
    } catch (error) {
      setFeedback({
        type: "error",
        text: resolveErrorMessage(error, "断开 AliOSS 失败"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="list-group p-4">
      <div className="space-y-3">
        <FieldInput
          label="AccessKeyId"
          value={props.safeSetting?.integration.aliOSS.accessKeyId ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                aliOSS: { ...prev.integration.aliOSS, accessKeyId: v },
              },
            }))
          }
          placeholder="AccessKeyId"
        />
        <FieldInput
          label="AccessKeySecret"
          value={props.safeSetting?.integration.aliOSS.accessKeySecret ?? ""}
          onChange={(v) =>
            props.updateSetting((prev) => ({
              ...prev,
              integration: {
                ...prev.integration,
                aliOSS: {
                  ...prev.integration.aliOSS,
                  accessKeySecret: v,
                },
              },
            }))
          }
          placeholder="AccessKeySecret"
          type="password"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          验证会使用当前同步/资源配置中的 Bucket 与 Region（当前：
          {bucket || "-"} / {region || "-"}）。
        </p>
        <FeedbackView feedback={feedback} />
        <button
          type="button"
          onClick={() => void handleVerifyAndSave()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {isVerifying
            ? "验证中..."
            : props.isSavingSetting
              ? "保存中..."
              : "验证并保存"}
        </button>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={isVerifying || props.isSavingSetting}
          className="w-full rounded-lg border border-red-300 py-3 text-sm font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
        >
          断开连接
        </button>
      </div>
    </div>
  );
}
