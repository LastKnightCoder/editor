import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { Eye, EyeOff } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Select,
  toast,
} from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { getGithubUserInfo } from "@/utils/github";
import { OnlineVideoPluginSettings } from "./OnlineVideoPluginSettings";
import { ROW_DIVIDER } from "../components/rowDivider";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

type Integration = ISetting["integration"];
type ServiceKey = "s3" | "github";
type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

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
      disconnectImpact="使用 S3 的博客发布将不可用"
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
      disconnectImpact="使用 GitHub 的博客发布将不可用"
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

/* ───────────── 页面 ───────────── */

const connectedChip = <StatusChip tone="ok">已连接</StatusChip>;
const disconnectedChip = <StatusChip>未连接</StatusChip>;

export function IntegrationSection() {
  const integration = useSettingStore(s => s.setting.integration);
  const [openKey, setOpenKey] = useState<ServiceKey | null>(null);

  const dialogProps = (key: ServiceKey): DialogProps => ({
    open: openKey === key,
    onOpenChange: open => setOpenKey(open ? key : null),
  });

  const { s3, github } = integration;

  return (
    <>
      <SettingsGroup title="存储服务" description="博客发布使用；同步与上传账号在对应插件中配置">
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

      <OnlineVideoPluginSettings />

      <S3Dialog {...dialogProps("s3")} />
      <GithubDialog {...dialogProps("github")} />
    </>
  );
}
