/**
 * 账号与连接 —— 第三方服务的账号与凭据（store key 仍是 integration），其它设置页从这里读取连接。
 *
 * 组织对照 mockups/settings 第三版「账号与连接」：三组列表行——
 * 存储服务（WebDAV / S3 / 阿里云 OSS / GitHub）、内容平台（Bilibili / YouTube / 微信读书）、
 * AI 平台（Minimax）。每行 = 首字母方块 + 服务名 + 身份/所需凭据说明 + 状态签 + 连接/管理按钮；
 * 凭据编辑统一进 Dialog（纵向表单，footer 取消 + 主动作，已连接时左下角「断开连接」二次确认）。
 * YouTube 只有一个代理字段，与 legacy 一致行内即时保存。
 *
 * 功能对齐 legacy IntegrationSetting 全量：各服务字段与必填校验、GitHub Token 校验并存用户名邮箱、
 * Minimax 经对话接口校验 Key、Bilibili 扫码（二维码 / 过期刷新 / 2s 轮询）与手动 SESSDATA 两种登录
 * 及用户信息/大会员展示、S3 请求风格、微信读书 API Key 校验与 检测中/可用/已失效/未连接 状态。
 * 行为调整：微信读书新增「断开连接」（清空 API Key）；YouTube 状态签按是否设置代理显示
 * （legacy 依据的 youtube.enabled 从无写入口，恒为未连接）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { ExternalLink, Eye, EyeOff, QrCode } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Segmented,
  Select,
  toast,
} from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { verifyMinimaxApiKey } from "@/commands/piAi";
import { openExternal } from "@/commands/extra";
import { getGithubUserInfo } from "@/utils/github";
import {
  BilibiliQRCodeStatus,
  checkBilibiliLogin,
  checkBilibiliQRStatus,
  extractCredentialsFromQR,
  getBilibiliQRCode,
} from "@/utils/bilibili";
import weReadService from "@/services/weread";
import { ROW_DIVIDER } from "../components/rowDivider";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

type Integration = ISetting["integration"];
type ServiceKey = "webdav" | "s3" | "aliOSS" | "github" | "bilibili" | "weread" | "minimax";
type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const WEREAD_API_KEY_URL = "https://weread.qq.com/r/weread-skills";

const mutateIntegration = (fn: (draft: Integration) => void) =>
  useSettingStore.setState(s => ({
    setting: produce(s.setting, draft => fn(draft.integration)),
  }));

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

const maskKey = (key: string) => (key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key);

const vipText = (vipStatus: number) =>
  vipStatus === 1 ? "大会员" : vipStatus === 0 ? "普通用户" : "未知";

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** 打开时以 store 当前值重置表单（渲染期派生，避免 effect 里 setState） */
function useFormOnOpen<T>(open: boolean, init: () => T) {
  const [form, setForm] = useState(init);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm(init());
  }
  return [form, setForm] as const;
}

/* ───────────── 通用片段 ───────────── */

function ServiceRow({
  mark,
  name,
  description,
  status,
  children,
}: {
  mark: ReactNode;
  name: string;
  description: ReactNode;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("rounded-tau-sm flex items-center gap-3 px-3 py-3", ROW_DIVIDER)}>
      <span className="bg-hover text-ink-2 rounded-tau-sm text-tau-meta grid size-8 flex-none place-items-center font-semibold">
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-tau-body text-ink-1 font-medium">{name}</div>
        <div className="text-tau-meta text-ink-2 truncate">{description}</div>
      </div>
      {status}
      <div className="flex flex-none items-center">{children}</div>
    </div>
  );
}

function RowAction({
  connected,
  name,
  label,
  onClick,
}: {
  connected: boolean;
  name: string;
  label?: string;
  onClick: () => void;
}) {
  const text = label ?? (connected ? "管理" : "连接");
  return (
    <Button variant="secondary" size="sm" aria-label={`${text} ${name}`} onClick={onClick}>
      {text}
    </Button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-tau-meta text-ink-2 font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-tau-meta text-danger">{error}</span>
      ) : hint ? (
        <span className="text-tau-meta text-ink-2">{hint}</span>
      ) : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  mono,
  invalid,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Input
      className={clsx(mono && "font-tau-mono")}
      value={value}
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid || undefined}
      onChange={e => onChange(e.target.value)}
      {...rest}
    />
  );
}

/** 密钥输入：password + 显隐切换 */
function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Input
        className="font-tau-mono min-w-0 flex-1"
        type={shown ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      <IconButton
        aria-label={shown ? `隐藏 ${label}` : `显示 ${label}`}
        onClick={() => setShown(v => !v)}
      >
        {shown ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
      </IconButton>
    </div>
  );
}

function HelpSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="text-tau-meta text-ink-2 list-decimal space-y-0.5 pl-5">
      {steps.map(step => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-tau-meta text-danger">
      {children}
    </p>
  );
}

/** 服务弹层外壳：footer = [断开连接（已连接时，左下）] 取消 + 主动作；断开走二次确认 */
function ServiceDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  connected,
  busy = false,
  disconnectImpact,
  onDisconnect,
  onAfterClose,
  primary,
  children,
}: DialogProps & {
  title: string;
  subtitle?: string;
  connected: boolean;
  busy?: boolean;
  disconnectImpact?: string;
  onDisconnect: () => void;
  onAfterClose?: () => void;
  primary?: ReactNode;
  children: ReactNode;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        onAfterClose={onAfterClose}
        title={title}
        subtitle={subtitle}
        locked={busy}
        footer={
          <>
            {connected && (
              <Button
                variant="danger-soft"
                className="mr-auto"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
              >
                断开连接
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {primary}
          </>
        }
      >
        <DialogBody>
          <div className="flex flex-col gap-3">{children}</div>
        </DialogBody>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="断开连接"
        context={title}
        danger
        description={`将清除 ${title} 已保存的凭据，之后需要重新连接。`}
        impact={disconnectImpact}
        confirmText="断开"
        onConfirm={() => {
          onDisconnect();
          setConfirmOpen(false);
          onOpenChange(false);
          toast.success(`已断开 ${title}`);
        }}
      />
    </>
  );
}

/* ───────────── 存储服务 ───────────── */

function WebDavDialog({ open, onOpenChange }: DialogProps) {
  const webdav = useSettingStore(s => s.setting.integration.webdav);
  const [form, setForm] = useFormOnOpen(open, () => ({
    url: webdav.url || "",
    username: webdav.username || "",
    password: webdav.password || "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const set = (key: keyof typeof form, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const save = () => {
    const next: typeof errors = {};
    if (!form.url.trim()) next.url = "请输入 WebDAV URL";
    else if (!/^https?:\/\/.+/.test(form.url)) next.url = "请输入有效的 URL";
    if (!form.username.trim()) next.username = "请输入用户名";
    if (!form.password.trim()) next.password = "请输入密码";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutateIntegration(draft => {
      draft.webdav = { enabled: true, ...form };
    });
    toast.success("WebDAV 配置已保存");
    onOpenChange(false);
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setErrors({})}
      title="WebDAV"
      subtitle="配置 WebDAV 服务器连接"
      connected={webdav.enabled}
      disconnectImpact="使用 WebDAV 的同步与资源存储将不可用"
      onDisconnect={() =>
        mutateIntegration(draft => {
          draft.webdav = { enabled: false, url: "", username: "", password: "" };
        })
      }
      primary={
        <Button variant="primary" onClick={save}>
          保存
        </Button>
      }
    >
      <Field label="WebDAV URL" error={errors.url}>
        <TextInput
          mono
          value={form.url}
          placeholder="https://dav.jianguoyun.com/dav/"
          invalid={Boolean(errors.url)}
          onChange={v => set("url", v)}
        />
      </Field>
      <Field label="用户名" error={errors.username}>
        <TextInput
          value={form.username}
          placeholder="请输入用户名"
          invalid={Boolean(errors.username)}
          onChange={v => set("username", v)}
        />
      </Field>
      <Field label="密码" error={errors.password}>
        <SecretInput
          label="密码"
          value={form.password}
          placeholder="请输入密码"
          invalid={Boolean(errors.password)}
          onChange={v => set("password", v)}
        />
      </Field>
    </ServiceDialog>
  );
}

function S3Dialog({ open, onOpenChange }: DialogProps) {
  const s3 = useSettingStore(s => s.setting.integration.s3);
  const [form, setForm] = useFormOnOpen(open, () => ({
    accessKeyId: s3.accessKeyId || "",
    secretAccessKey: s3.secretAccessKey || "",
    endpoint: s3.endpoint || "",
    urlStyle: s3.urlStyle || ("path" as Integration["s3"]["urlStyle"]),
  }));
  const [errors, setErrors] = useState<Partial<Record<"accessKeyId" | "secretAccessKey", string>>>(
    {}
  );
  const set = (key: "accessKeyId" | "secretAccessKey" | "endpoint", value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const save = () => {
    const next: typeof errors = {};
    if (!form.accessKeyId.trim()) next.accessKeyId = "请输入 Access Key ID";
    if (!form.secretAccessKey.trim()) next.secretAccessKey = "请输入 Secret Access Key";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutateIntegration(draft => {
      draft.s3 = { enabled: true, ...form };
    });
    toast.success("S3 配置已保存");
    onOpenChange(false);
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setErrors({})}
      title="S3"
      subtitle="S3 兼容的对象存储服务"
      connected={s3.enabled}
      disconnectImpact="使用 S3 的同步与资源存储将不可用"
      onDisconnect={() =>
        mutateIntegration(draft => {
          draft.s3 = {
            enabled: false,
            accessKeyId: "",
            secretAccessKey: "",
            endpoint: "",
            urlStyle: "path",
          };
        })
      }
      primary={
        <Button variant="primary" onClick={save}>
          保存
        </Button>
      }
    >
      <Field label="Access Key ID" error={errors.accessKeyId}>
        <TextInput
          mono
          value={form.accessKeyId}
          placeholder="请输入 Access Key ID"
          invalid={Boolean(errors.accessKeyId)}
          onChange={v => set("accessKeyId", v)}
        />
      </Field>
      <Field label="Secret Access Key" error={errors.secretAccessKey}>
        <SecretInput
          label="Secret Access Key"
          value={form.secretAccessKey}
          placeholder="请输入 Secret Access Key"
          invalid={Boolean(errors.secretAccessKey)}
          onChange={v => set("secretAccessKey", v)}
        />
      </Field>
      <Field label="Endpoint（可选）" hint="留空使用 AWS 默认端点">
        <TextInput
          mono
          value={form.endpoint}
          placeholder="https://s3.us-west-2.amazonaws.com"
          onChange={v => set("endpoint", v)}
        />
      </Field>
      <Field label="请求风格">
        <Select
          aria-label="请求风格"
          className="w-full"
          value={form.urlStyle}
          options={[
            { value: "path", label: "Path Style（路径风格）" },
            { value: "virtualHosted", label: "Virtual Hosted（虚拟托管风格）" },
          ]}
          onValueChange={v =>
            setForm(f => ({ ...f, urlStyle: v as Integration["s3"]["urlStyle"] }))
          }
        />
      </Field>
    </ServiceDialog>
  );
}

function AliOSSDialog({ open, onOpenChange }: DialogProps) {
  const aliOSS = useSettingStore(s => s.setting.integration.aliOSS);
  const [form, setForm] = useFormOnOpen(open, () => ({
    accessKeyId: aliOSS.accessKeyId || "",
    accessKeySecret: aliOSS.accessKeySecret || "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const set = (key: keyof typeof form, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const save = () => {
    const next: typeof errors = {};
    if (!form.accessKeyId.trim()) next.accessKeyId = "请输入 Access Key ID";
    if (!form.accessKeySecret.trim()) next.accessKeySecret = "请输入 Access Key Secret";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutateIntegration(draft => {
      draft.aliOSS = { enabled: true, ...form };
    });
    toast.success("阿里云 OSS 配置已保存");
    onOpenChange(false);
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setErrors({})}
      title="阿里云 OSS"
      subtitle="阿里云对象存储服务"
      connected={aliOSS.enabled}
      disconnectImpact="使用阿里云 OSS 的同步与资源存储将不可用"
      onDisconnect={() =>
        mutateIntegration(draft => {
          draft.aliOSS = { enabled: false, accessKeyId: "", accessKeySecret: "" };
        })
      }
      primary={
        <Button variant="primary" onClick={save}>
          保存
        </Button>
      }
    >
      <Field label="Access Key ID" error={errors.accessKeyId}>
        <TextInput
          mono
          value={form.accessKeyId}
          placeholder="请输入 Access Key ID"
          invalid={Boolean(errors.accessKeyId)}
          onChange={v => set("accessKeyId", v)}
        />
      </Field>
      <Field label="Access Key Secret" error={errors.accessKeySecret}>
        <SecretInput
          label="Access Key Secret"
          value={form.accessKeySecret}
          placeholder="请输入 Access Key Secret"
          invalid={Boolean(errors.accessKeySecret)}
          onChange={v => set("accessKeySecret", v)}
        />
      </Field>
      <HelpSteps steps={["访问阿里云控制台", "进入 AccessKey 管理", "创建或查看 AccessKey"]} />
    </ServiceDialog>
  );
}

function GithubDialog({ open, onOpenChange }: DialogProps) {
  const github = useSettingStore(s => s.setting.integration.github);
  const [token, setToken] = useFormOnOpen(open, () => github.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verify = async () => {
    const value = token.trim();
    if (!value) {
      setError("请输入 GitHub Token");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const userInfo = await getGithubUserInfo(value);
      if (!userInfo) {
        setError("Token 验证失败，请检查是否正确");
        return;
      }
      mutateIntegration(draft => {
        draft.github.token = value;
        draft.github.user = { name: userInfo.login, email: userInfo.email || "" };
        draft.github.enabled = true;
      });
      toast.success("GitHub 已连接");
      onOpenChange(false);
    } catch (err) {
      console.error("验证 Github Token 失败:", err);
      setError("验证失败，请检查 Token 是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setError("")}
      title="GitHub"
      subtitle="配置 Personal Access Token"
      connected={github.enabled}
      busy={loading}
      disconnectImpact="使用 GitHub 的同步与资源存储将不可用"
      onDisconnect={() =>
        mutateIntegration(draft => {
          draft.github.token = "";
          draft.github.user = { name: "", email: "" };
          draft.github.enabled = false;
        })
      }
      primary={
        <Button
          variant="primary"
          loading={loading}
          loadingText="验证中…"
          disabled={!token.trim()}
          onClick={() => void verify()}
        >
          验证并连接
        </Button>
      }
    >
      <Field label="Personal Access Token">
        <SecretInput
          label="Personal Access Token"
          value={token}
          placeholder="ghp_…"
          disabled={loading}
          onChange={v => {
            setToken(v);
            setError("");
          }}
        />
      </Field>
      <HelpSteps
        steps={[
          "访问 https://github.com/settings/tokens",
          "点击 “Generate new token (classic)”",
          "勾选 repo 权限",
          "生成并复制 Token",
        ]}
      />
      <ErrorLine>{error}</ErrorLine>
    </ServiceDialog>
  );
}

/* ───────────── 内容平台 ───────────── */

/** Bilibili 扫码登录：取码 → 2s 轮询状态 → 成功后换取凭据并写入 store */
function useBilibiliQrLogin(onSuccess: () => void) {
  const updateCredentials = useSettingStore(s => s.updateBilibiliCredentials);
  const updateUserInfo = useSettingStore(s => s.updateBilibiliUserInfo);
  const setEnabled = useSettingStore(s => s.setBilibiliEnabled);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 每次取码/重置自增；异步回调发现代次变化即放弃（关闭弹层后不再落状态） */
  const generationRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const reset = () => {
    generationRef.current += 1;
    stopPolling();
    setQrUrl(null);
    setLoading(false);
    setStatus("");
    setError("");
    setExpired(false);
  };

  const startPolling = (qrcodeKey: string, generation: number) => {
    stopPolling();
    timerRef.current = setInterval(async () => {
      try {
        const result = await checkBilibiliQRStatus(qrcodeKey);
        if (generation !== generationRef.current) return;
        switch (result.code) {
          case BilibiliQRCodeStatus.SUCCESS:
            stopPolling();
            if (!result.url) break;
            try {
              const credentials = await extractCredentialsFromQR(result.url);
              const userInfo = await checkBilibiliLogin(credentials);
              updateCredentials(credentials);
              updateUserInfo(userInfo);
              setEnabled(true);
              setStatus("登录成功！");
              toast.success("Bilibili 已连接");
              onSuccess();
            } catch (err) {
              console.error("处理登录结果失败:", err);
              setError("登录处理失败，请重试");
            }
            break;
          case BilibiliQRCodeStatus.EXPIRED:
            stopPolling();
            setExpired(true);
            setStatus("二维码已过期，请刷新重试");
            break;
          case BilibiliQRCodeStatus.NOT_CONFIRMED:
            setStatus("扫码成功，请在手机上确认登录");
            break;
          case BilibiliQRCodeStatus.NOT_SCANNED:
            break;
          default:
            setStatus(result.message || "未知状态");
        }
      } catch (err) {
        console.error("检查二维码状态失败:", err);
      }
    }, 2000);
  };

  const fetchQrCode = async () => {
    generationRef.current += 1;
    const generation = generationRef.current;
    stopPolling();
    setLoading(true);
    setError("");
    setExpired(false);
    try {
      const info = await getBilibiliQRCode();
      if (generation !== generationRef.current) return;
      setQrUrl(info.url);
      setStatus("请使用 Bilibili 手机客户端扫描二维码");
      startPolling(info.qrcodeKey, generation);
    } catch (err) {
      console.error("获取二维码失败:", err);
      if (generation === generationRef.current) setError("获取二维码失败，请重试");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  };

  return { qrUrl, loading, status, error, expired, fetchQrCode, reset };
}

function BilibiliDialog({ open, onOpenChange }: DialogProps) {
  const bilibili = useSettingStore(s => s.setting.integration.bilibili);
  const updateCredentials = useSettingStore(s => s.updateBilibiliCredentials);
  const updateUserInfo = useSettingStore(s => s.updateBilibiliUserInfo);
  const setEnabled = useSettingStore(s => s.setBilibiliEnabled);

  const [mode, setMode] = useState<"qrcode" | "manual">("qrcode");
  const [manual, setManual] = useFormOnOpen(open, () => ({
    sessdata: bilibili.credentials.SESSDATA,
    bfeId: bilibili.credentials.bfe_id || "",
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qr = useBilibiliQrLogin(() => onOpenChange(false));

  const handleOpenChange = (next: boolean) => {
    if (!next) qr.reset();
    onOpenChange(next);
  };

  const verifyManual = async () => {
    if (!manual.sessdata.trim()) {
      setError("请输入 SESSDATA");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const credentials = { SESSDATA: manual.sessdata, bfe_id: manual.bfeId };
      const userInfo = await checkBilibiliLogin(credentials);
      if (!userInfo.isLogin) {
        setError("凭证无效，请检查 SESSDATA 是否正确");
        return;
      }
      updateCredentials(credentials);
      updateUserInfo(userInfo);
      setEnabled(true);
      toast.success("Bilibili 已连接");
      handleOpenChange(false);
    } catch (err) {
      console.error("验证凭证失败:", err);
      setError("验证失败，请检查凭证是否正确");
    } finally {
      setLoading(false);
    }
  };

  const { userInfo } = bilibili;

  return (
    <ServiceDialog
      open={open}
      onOpenChange={handleOpenChange}
      onAfterClose={() => {
        qr.reset();
        setMode("qrcode");
        setError("");
      }}
      title="Bilibili"
      subtitle="扫码或手动填写 Cookie 登录"
      connected={userInfo.isLogin}
      busy={loading}
      disconnectImpact="Bilibili 视频导入将以未登录身份访问"
      onDisconnect={() => {
        updateCredentials({ SESSDATA: "", bfe_id: "" });
        updateUserInfo({ name: "", avatar: "", isLogin: false, vipStatus: 0 });
        setEnabled(false);
      }}
      primary={
        mode === "manual" ? (
          <Button
            variant="primary"
            loading={loading}
            loadingText="验证中…"
            disabled={!manual.sessdata.trim()}
            onClick={() => void verifyManual()}
          >
            验证并登录
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={QrCode}
            loading={qr.loading}
            loadingText="获取中…"
            onClick={() => void qr.fetchQrCode()}
          >
            {qr.qrUrl ? "刷新二维码" : "获取二维码"}
          </Button>
        )
      }
    >
      {userInfo.isLogin && (
        <div className="bg-hover rounded-tau-sm flex items-center gap-2.5 px-3 py-2">
          {userInfo.avatar && (
            <img
              src={userInfo.avatar}
              alt=""
              referrerPolicy="no-referrer"
              className="size-7 flex-none rounded-full"
            />
          )}
          <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate font-medium">
            {userInfo.name}
          </span>
          <span className="text-tau-meta text-ink-2 flex-none">{vipText(userInfo.vipStatus)}</span>
        </div>
      )}
      <Segmented
        label="登录方式"
        size="sm"
        value={mode}
        onValueChange={v => setMode(v as typeof mode)}
      >
        <Segmented.Item value="qrcode" label="扫码登录" />
        <Segmented.Item value="manual" label="手动输入" />
      </Segmented>

      {mode === "qrcode" ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          {qr.qrUrl ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr.qrUrl)}`}
              alt="Bilibili 登录二维码"
              className={clsx("rounded-tau-sm size-[180px]", qr.expired && "opacity-40")}
            />
          ) : (
            <div className="bg-sunken text-ink-3 rounded-tau-sm grid size-[180px] place-items-center">
              <QrCode size={32} strokeWidth={1.5} />
            </div>
          )}
          <p className="text-tau-meta text-ink-2">
            {qr.loading
              ? "正在获取二维码…"
              : qr.status || "使用 Bilibili 手机客户端扫码登录，更安全便捷"}
          </p>
          <ErrorLine>{qr.error}</ErrorLine>
        </div>
      ) : (
        <>
          <Field label="SESSDATA">
            <SecretInput
              label="SESSDATA"
              value={manual.sessdata}
              placeholder="请输入 SESSDATA"
              disabled={loading}
              onChange={v => {
                setManual(m => ({ ...m, sessdata: v }));
                setError("");
              }}
            />
          </Field>
          <Field label="bfe_id（可选）">
            <TextInput
              mono
              value={manual.bfeId}
              placeholder="请输入 bfe_id"
              disabled={loading}
              onChange={v => {
                setManual(m => ({ ...m, bfeId: v }));
                setError("");
              }}
            />
          </Field>
          <HelpSteps
            steps={[
              "打开 Bilibili 网站并登录",
              "按 F12 打开开发者工具",
              "切换到 Application / Storage 标签",
              "在 Cookies 中找到 SESSDATA 值",
            ]}
          />
          <ErrorLine>{error}</ErrorLine>
        </>
      )}
    </ServiceDialog>
  );
}

type WeRead = Integration["weread"];

const WEREAD_STATUS: Record<
  WeRead["connectionStatus"],
  { tone: "ok" | "warn" | "accent" | "neutral"; text: string }
> = {
  checking: { tone: "accent", text: "检测中" },
  valid: { tone: "ok", text: "可用" },
  invalid: { tone: "warn", text: "已失效" },
  unknown: { tone: "neutral", text: "未连接" },
};

function wereadDetail(weread: WeRead) {
  switch (weread.connectionStatus) {
    case "checking":
      return "正在验证微信读书 API Key";
    case "valid":
      return "当前 API Key 可正常同步微信读书数据";
    case "invalid":
      return weread.statusReason || "API Key 已失效，请重新配置";
    default:
      return weread.apiKey.trim() ? "已保存 API Key，尚未校验" : "需要微信读书 API Key";
  }
}

function WeReadDialog({ open, onOpenChange }: DialogProps) {
  const weread = useSettingStore(s => s.setting.integration.weread);
  const updateApiKey = useSettingStore(s => s.updateWeReadApiKey);
  const [apiKey, setApiKey] = useFormOnOpen(open, () => weread.apiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const meta = WEREAD_STATUS[weread.connectionStatus];

  const validate = async () => {
    const value = apiKey.trim();
    if (!value) {
      setError("请输入微信读书 API Key");
      return;
    }
    setLoading(true);
    setError("");
    try {
      updateApiKey(value);
      const valid = await weReadService.validateSession();
      if (!valid) {
        setError(
          useSettingStore.getState().setting.integration.weread.statusReason || "API Key 校验失败"
        );
        return;
      }
      toast.success("微信读书 API Key 可用");
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err, "API Key 校验失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setError("")}
      title="微信读书"
      subtitle="通过官方 API Key 同步书架、划线与想法"
      connected={Boolean(weread.apiKey.trim())}
      busy={loading}
      disconnectImpact="微信读书同步将停止"
      onDisconnect={() => updateApiKey("")}
      primary={
        <Button
          variant="primary"
          loading={loading}
          loadingText="校验中…"
          disabled={!apiKey.trim()}
          onClick={() => void validate()}
        >
          {weread.connectionStatus === "valid" ? "重新校验" : "保存并校验"}
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <StatusChip tone={meta.tone}>{meta.text}</StatusChip>
        <span className="text-tau-meta text-ink-2 min-w-0">{wereadDetail(weread)}</span>
      </div>
      <Field label="API Key">
        <SecretInput
          label="API Key"
          value={apiKey}
          placeholder="wrk-xxxxxxxxxxxxxxxx"
          disabled={loading}
          onChange={v => {
            setApiKey(v);
            setError("");
          }}
        />
      </Field>
      <button
        type="button"
        onClick={() => void openExternal(WEREAD_API_KEY_URL)}
        className="text-tau-meta text-accent-text flex items-center gap-1 self-start hover:underline"
      >
        获取微信读书 API Key
        <ExternalLink size={12} strokeWidth={1.75} />
      </button>
      <ErrorLine>{error}</ErrorLine>
    </ServiceDialog>
  );
}

/* ───────────── AI 平台 ───────────── */

function MinimaxDialog({ open, onOpenChange }: DialogProps) {
  const minimax = useSettingStore(s => s.setting.integration.minimax);
  const updateApiKey = useSettingStore(s => s.updateMinimaxApiKey);
  const setEnabled = useSettingStore(s => s.setMinimaxEnabled);
  const [apiKey, setApiKey] = useFormOnOpen(open, () => minimax.apiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verify = async () => {
    const value = apiKey.trim();
    if (!value) {
      setError("请输入 Minimax API Key");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // 用一次最短对话验证 Key（走 pi，与 legacy 设置页同一入口）
      await verifyMinimaxApiKey(value);
      updateApiKey(value);
      setEnabled(true);
      toast.success("Minimax 已连接");
      onOpenChange(false);
    } catch (err) {
      console.error("验证 Minimax API Key 失败:", err);
      setError("验证失败，请检查 API Key 是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ServiceDialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setError("")}
      title="Minimax"
      subtitle="配置 API Key 以使用 Minimax 语音合成"
      connected={minimax.enabled}
      busy={loading}
      disconnectImpact="Minimax 语音合成将不可用"
      onDisconnect={() => {
        updateApiKey("");
        setEnabled(false);
      }}
      primary={
        <Button
          variant="primary"
          loading={loading}
          loadingText="验证中…"
          disabled={!apiKey.trim()}
          onClick={() => void verify()}
        >
          验证并连接
        </Button>
      }
    >
      <Field label="API Key">
        <SecretInput
          label="API Key"
          value={apiKey}
          placeholder="请输入 Minimax API Key"
          disabled={loading}
          onChange={v => {
            setApiKey(v);
            setError("");
          }}
        />
      </Field>
      <HelpSteps
        steps={[
          "访问 https://platform.minimaxi.com",
          "登录并进入控制台",
          "在 API 管理中创建 API Key",
          "复制 API Key 并粘贴到上方",
        ]}
      />
      <ErrorLine>{error}</ErrorLine>
    </ServiceDialog>
  );
}

/* ───────────── 页面 ───────────── */

const connectedChip = <StatusChip tone="ok">已连接</StatusChip>;
const disconnectedChip = <StatusChip>未连接</StatusChip>;

export function IntegrationSection() {
  const integration = useSettingStore(s => s.setting.integration);
  const updateYoutubeProxy = useSettingStore(s => s.updateYoutubeProxy);
  const [openKey, setOpenKey] = useState<ServiceKey | null>(null);

  const dialogProps = (key: ServiceKey): DialogProps => ({
    open: openKey === key,
    onOpenChange: open => setOpenKey(open ? key : null),
  });

  const { webdav, s3, aliOSS, github, bilibili, youtube, weread, minimax } = integration;
  const wereadMeta = WEREAD_STATUS[weread.connectionStatus];
  const wereadConfigured = Boolean(weread.apiKey.trim());

  return (
    <>
      <SettingsGroup title="存储服务" description="同步与资源存储使用">
        <ServiceRow
          mark="W"
          name="WebDAV"
          description={
            webdav.enabled
              ? `${hostOf(webdav.url)} · ${webdav.username}`
              : "需要服务器地址、用户名与密码"
          }
          status={webdav.enabled ? connectedChip : disconnectedChip}
        >
          <RowAction
            connected={webdav.enabled}
            name="WebDAV"
            onClick={() => setOpenKey("webdav")}
          />
        </ServiceRow>
        <ServiceRow
          mark="S3"
          name="S3"
          description={
            s3.enabled
              ? `${s3.endpoint ? hostOf(s3.endpoint) : "AWS S3 默认端点"} · ${
                  s3.urlStyle === "virtualHosted" ? "虚拟托管风格" : "路径风格"
                }`
              : "需要 Access Key、Secret 与 Endpoint"
          }
          status={s3.enabled ? connectedChip : disconnectedChip}
        >
          <RowAction connected={s3.enabled} name="S3" onClick={() => setOpenKey("s3")} />
        </ServiceRow>
        <ServiceRow
          mark="O"
          name="阿里云 OSS"
          description={
            aliOSS.enabled
              ? `Access Key ${maskKey(aliOSS.accessKeyId)}`
              : "需要 Access Key 与 Secret"
          }
          status={aliOSS.enabled ? connectedChip : disconnectedChip}
        >
          <RowAction
            connected={aliOSS.enabled}
            name="阿里云 OSS"
            onClick={() => setOpenKey("aliOSS")}
          />
        </ServiceRow>
        <ServiceRow
          mark="G"
          name="GitHub"
          description={
            github.enabled
              ? github.user.name
                ? `@${github.user.name}${github.user.email ? ` · ${github.user.email}` : ""}`
                : "Token 已配置"
              : "需要 Personal Access Token"
          }
          status={github.enabled ? connectedChip : disconnectedChip}
        >
          <RowAction
            connected={github.enabled}
            name="GitHub"
            onClick={() => setOpenKey("github")}
          />
        </ServiceRow>
      </SettingsGroup>

      <SettingsGroup title="内容平台" description="视频导入与读书同步">
        <ServiceRow
          mark="B"
          name="Bilibili"
          description={
            bilibili.userInfo.isLogin
              ? `${bilibili.userInfo.name} · ${vipText(bilibili.userInfo.vipStatus)}`
              : "扫码登录或填写 SESSDATA"
          }
          status={bilibili.userInfo.isLogin ? connectedChip : disconnectedChip}
        >
          <RowAction
            connected={bilibili.userInfo.isLogin}
            name="Bilibili"
            onClick={() => setOpenKey("bilibili")}
          />
        </ServiceRow>
        <ServiceRow
          mark="Y"
          name="YouTube"
          description="配置 HTTP/HTTPS 代理以访问 YouTube"
          status={
            youtube.proxy.trim() ? (
              <StatusChip tone="ok">已设代理</StatusChip>
            ) : (
              <StatusChip>直连</StatusChip>
            )
          }
        >
          <Input
            aria-label="YouTube 代理"
            className="font-tau-mono w-[200px]"
            size="sm"
            value={youtube.proxy}
            placeholder="http://127.0.0.1:7890"
            spellCheck={false}
            onChange={e => updateYoutubeProxy(e.target.value)}
          />
        </ServiceRow>
        <ServiceRow
          mark="读"
          name="微信读书"
          description={wereadDetail(weread)}
          status={<StatusChip tone={wereadMeta.tone}>{wereadMeta.text}</StatusChip>}
        >
          <RowAction
            connected={wereadConfigured}
            name="微信读书"
            label={weread.connectionStatus === "invalid" ? "重新校验" : undefined}
            onClick={() => setOpenKey("weread")}
          />
        </ServiceRow>
      </SettingsGroup>

      <SettingsGroup title="AI 平台" description="语音合成使用">
        <ServiceRow
          mark="M"
          name="Minimax"
          description={minimax.enabled ? "API Key 已配置" : "需要 API Key"}
          status={minimax.enabled ? connectedChip : disconnectedChip}
        >
          <RowAction
            connected={minimax.enabled}
            name="Minimax"
            onClick={() => setOpenKey("minimax")}
          />
        </ServiceRow>
      </SettingsGroup>

      <WebDavDialog {...dialogProps("webdav")} />
      <S3Dialog {...dialogProps("s3")} />
      <AliOSSDialog {...dialogProps("aliOSS")} />
      <GithubDialog {...dialogProps("github")} />
      <BilibiliDialog {...dialogProps("bilibili")} />
      <WeReadDialog {...dialogProps("weread")} />
      <MinimaxDialog {...dialogProps("minimax")} />
    </>
  );
}
