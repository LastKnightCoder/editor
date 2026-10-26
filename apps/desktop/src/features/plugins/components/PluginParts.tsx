import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpCircle,
  Check,
  Download,
  Lock,
  MoreHorizontal,
  Package,
  RotateCw,
  Store,
} from "lucide-react";
import { Button, Checkbox, ConfirmDialog, IconButton, Menu, cn } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { relaunchForPlugins } from "@/commands/plugin-local";
import type { PluginBackendManifest } from "@tau/plugins/package";
import {
  SOURCE_LABELS,
  SYSTEM_ACCESS_LABELS,
  readSkipInstallNotice,
  saveSkipInstallNotice,
  type InstallState,
  type PluginSourceKind,
} from "../model";
import { pluginReleaseQuery, useInstallRelease, useReleaseInstallState } from "../queries";

const CHIP = "text-tau-sm inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2";

export function SourceChip({ source }: { source: PluginSourceKind }) {
  const Icon = { center: Store, zip: Package }[source];
  return (
    <span className={cn(CHIP, "bg-hover text-ink-2")}>
      <Icon className="size-3" strokeWidth={1.75} />
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function StagedChip({ version }: { version?: string }) {
  return (
    <span className={cn(CHIP, "bg-accent-soft text-accent-text")}>
      <RotateCw className="size-3" strokeWidth={1.75} />
      {version ? `${version} 重启后生效` : "重启后生效"}
    </span>
  );
}

const INSTALL_NOTICE =
  "插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。安装后即启用，可随时在「已安装」中停用。普通插件立即生效，编辑器和白板内容插件需重启应用后生效。";

type InstallConfirm = { kind: "plain" } | { kind: "backend"; backend: PluginBackendManifest };

/**
 * 从插件中心安装即启用；只有需要更新启动快照的变更显示重启提示。
 * 安装前先读发布记录判定是否含后台：含后台每次提示，普通插件可勾选不再提示。
 */
export function InstallButton({
  state,
  name,
  onCancel,
}: {
  state: InstallState;
  name: string;
  onCancel?: () => void;
}) {
  const runtime = useDesktopPlugins();
  const install = useInstallRelease(runtime);
  const progress = useReleaseInstallState("releaseId" in state ? state.releaseId : undefined);
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<InstallConfirm>({ kind: "plain" });
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const [skipNotice, setSkipNotice] = useState(false);
  if (state.kind === "staged")
    return (
      <span className="flex items-center gap-1">
        <StagedChip version={state.version} />
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        )}
      </span>
    );
  if (state.kind === "installed")
    return (
      <span className={cn(CHIP, "bg-ok-soft text-ok")}>
        <Check className="size-3" strokeWidth={2} />
        已安装
      </span>
    );
  if (state.kind === "local")
    return <span className={cn(CHIP, "bg-hover text-ink-2")}>已本地安装</span>;
  if (state.kind === "incompatible")
    return (
      <span className={cn(CHIP, "bg-hover text-ink-2")} title="请先更新客户端">
        <Lock className="size-3" strokeWidth={1.75} />
        需要客户端 {state.minAppVersion}
      </span>
    );
  const update = state.kind === "update";
  const start = () => install.mutate(state.releaseId);
  const request = async () => {
    setChecking(true);
    // 读不到发布记录时无法确认是否含后台，按普通提示处理，安装本身会在主进程再校验。
    const release = await client.fetchQuery(pluginReleaseQuery(state.releaseId)).catch(() => null);
    setChecking(false);
    const backend = release?.content.manifest.backend;
    if (!backend && release && readSkipInstallNotice()) return start();
    setConfirm(backend ? { kind: "backend", backend } : { kind: "plain" });
    setConfirming(true);
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant={update ? "soft" : "secondary"}
        size="sm"
        icon={update ? ArrowUpCircle : Download}
        loading={progress.pending || checking}
        loadingText={checking ? "读取中" : "下载校验中"}
        aria-label={update ? `更新 ${name} 到 ${state.version}` : `安装 ${name}`}
        onClick={event => {
          event.stopPropagation();
          if (update) start();
          else void request();
        }}
      >
        {update ? `更新到 ${state.version}` : "安装"}
      </Button>
      {progress.error && (
        <span role="alert" className="text-tau-sm text-danger max-w-[220px] text-right">
          {progress.error instanceof Error ? progress.error.message : "安装失败"}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={open => {
          setConfirming(open);
          if (!open) setSkipNotice(false);
        }}
        danger={confirm.kind === "backend"}
        title={`安装「${name}」${state.version}？`}
        description={
          confirm.kind === "backend" ? (
            <div className="flex flex-col gap-3">
              <p>
                此插件包含本机后台代码，可使用当前用户的系统权限。独立进程不限制它对文件和网络的访问，插件中心已审核此版本的系统能力，但不保证没有缺陷。
              </p>
              <p className="text-ink-1">{confirm.backend.reason}</p>
              <p>
                系统用途：
                {confirm.backend.systemAccess
                  .map(value => SYSTEM_ACCESS_LABELS[value])
                  .join("、") || "系统信息与计算"}
              </p>
              <p>{INSTALL_NOTICE}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p>{INSTALL_NOTICE}</p>
              <Checkbox
                checked={skipNotice}
                onChange={event => setSkipNotice(event.target.checked)}
                label="以后安装不再提示（含后台的插件仍会提示，可在插件页「⋯」中恢复）"
              />
            </div>
          )
        }
        confirmText="安装"
        onConfirm={() => {
          if (confirm.kind === "plain" && skipNotice) saveSkipInstallNotice(true);
          start();
        }}
      />
    </span>
  );
}

export function RestartBar({ count }: { count: number }) {
  const [error, setError] = useState("");
  if (count === 0) return null;
  return (
    <div className="bg-accent-soft text-accent-text text-tau-meta flex items-center gap-3 rounded-[var(--tau-radius-md)] px-3.5 py-2.5">
      <RotateCw className="size-4 flex-none" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{count} 项变更</b>
        涉及内容插件的变更将在重启后生效。
        {error && <span className="text-danger ml-2">{error}</span>}
      </span>
      <Button
        variant="primary"
        size="sm"
        onClick={() =>
          void relaunchForPlugins().catch(cause =>
            setError(cause instanceof Error ? cause.message : "重启失败")
          )
        }
      >
        立即重启
      </Button>
    </div>
  );
}

export function UninstallDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (purgeData: boolean) => Promise<unknown>;
}) {
  const [purge, setPurge] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setPurge(false);
      }}
      danger
      title={`卸载「${name}」？`}
      description={
        <div className="flex flex-col gap-3">
          <p>将停用插件并移除代码与旧版本备份，它贡献的入口随之消失。已写入笔记的内容不受影响。</p>
          <Checkbox
            checked={purge}
            onChange={event => setPurge(event.target.checked)}
            label="同时删除插件的私有数据（设置与插件自己保存的记录）"
          />
          {!purge && <p className="text-ink-3">不删除时，重新安装可恢复这些数据。</p>}
        </div>
      }
      confirmText="卸载"
      onConfirm={() => onConfirm(purge)}
    />
  );
}

export function MoreButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menu
      align="end"
      trigger={
        <IconButton aria-label={label}>
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </IconButton>
      }
    >
      {children}
    </Menu>
  );
}
