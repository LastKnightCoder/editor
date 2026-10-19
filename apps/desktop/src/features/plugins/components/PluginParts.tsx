import { useState } from "react";
import {
  ArrowUpCircle,
  Check,
  Download,
  FlaskConical,
  Lock,
  MoreHorizontal,
  Package,
  RotateCw,
  Store,
} from "lucide-react";
import { Button, Checkbox, ConfirmDialog, IconButton, Menu, cn } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { relaunchForPlugins } from "@/commands/plugin-local";
import { SOURCE_LABELS, type InstallState, type PluginSourceKind } from "../model";
import { useInstallRelease } from "../queries";

const CHIP = "text-tau-sm inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2";

export function SourceChip({ source }: { source: PluginSourceKind }) {
  const Icon = { center: Store, zip: Package, development: FlaskConical, builtin: null }[source];
  return (
    <span
      className={cn(
        CHIP,
        source === "development" ? "bg-warn-soft text-warn" : "bg-hover text-ink-2"
      )}
    >
      {Icon && <Icon className="size-3" strokeWidth={1.75} />}
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

/** 安装后默认停用；只有需要更新启动快照的变更显示重启提示。 */
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
  const [confirming, setConfirming] = useState(false);
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
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant={update ? "soft" : "secondary"}
        size="sm"
        icon={update ? ArrowUpCircle : Download}
        loading={install.isPending}
        loadingText="下载校验中"
        aria-label={update ? `更新 ${name} 到 ${state.version}` : `安装 ${name}`}
        onClick={event => {
          event.stopPropagation();
          if (update) start();
          else setConfirming(true);
        }}
      >
        {update ? `更新到 ${state.version}` : "安装"}
      </Button>
      {install.error && (
        <span role="alert" className="text-tau-sm text-danger max-w-[220px] text-right">
          {install.error instanceof Error ? install.error.message : "安装失败"}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`安装「${name}」${state.version}？`}
        description="插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。安装后默认停用，请到「已安装」中主动启用。普通插件即时生效，编辑器和白板内容插件启用后需重启应用。"
        confirmText="安装"
        onConfirm={start}
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
