import { SOURCE_LABELS, SYSTEM_ACCESS_LABELS } from "../display";
import { pluginTranslator, pluginCount, usePluginI18n } from "@/features/plugins/i18n";
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
  readSkipInstallNotice,
  saveSkipInstallNotice,
  type InstallState,
  type PluginSourceKind,
} from "../model";
import { pluginReleaseQuery, useInstallRelease, useReleaseInstallState } from "../queries";
const t = pluginTranslator.t;

const CHIP = "text-tau-sm inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2";

export function SourceChip({ source }: { source: PluginSourceKind }) {
  usePluginI18n();
  const Icon = { center: Store, zip: Package }[source];
  return (
    <span className={cn(CHIP, "bg-hover text-ink-2")}>
      <Icon className="size-3" strokeWidth={1.75} />
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function StagedChip({ version }: { version?: string }) {
  usePluginI18n();
  return (
    <span className={cn(CHIP, "bg-accent-soft text-accent-text")}>
      <RotateCw className="size-3" strokeWidth={1.75} />
      {version ? t("install.stagedVersion", { version }) : t("install.restart")}
    </span>
  );
}

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
  usePluginI18n();
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
            {t("common.cancel")}
          </Button>
        )}
      </span>
    );
  if (state.kind === "installed")
    return (
      <span className={cn(CHIP, "bg-ok-soft text-ok")}>
        <Check className="size-3" strokeWidth={2} />
        {t("common.installed")}
      </span>
    );
  if (state.kind === "local")
    return <span className={cn(CHIP, "bg-hover text-ink-2")}>{t("install.local")}</span>;
  if (state.kind === "incompatible")
    return (
      <span className={cn(CHIP, "bg-hover text-ink-2")} title={t("install.upgradeApp")}>
        <Lock className="size-3" strokeWidth={1.75} />
        {t("version.requiresApp", { version: state.minAppVersion })}
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
        loadingText={checking ? t("install.reading") : t("install.downloading")}
        aria-label={
          update
            ? t("install.updatePlugin", { name, version: state.version })
            : t("install.installPlugin", { name })
        }
        onClick={event => {
          event.stopPropagation();
          if (update) start();
          else void request();
        }}
      >
        {update ? t("install.updateVersion", { version: state.version }) : t("common.install")}
      </Button>
      {progress.error && (
        <span role="alert" className="text-tau-sm text-danger max-w-[220px] text-right">
          {progress.error instanceof Error ? progress.error.message : t("common.installFailed")}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={open => {
          setConfirming(open);
          if (!open) setSkipNotice(false);
        }}
        danger={confirm.kind === "backend"}
        title={t("install.confirm", { name, version: state.version })}
        description={
          confirm.kind === "backend" ? (
            <div className="flex flex-col gap-3">
              <p>{t("install.backendNotice")}</p>
              <p className="text-ink-1">{confirm.backend.reason}</p>
              <p>
                {t("install.systemPurpose")}
                {confirm.backend.systemAccess
                  .map(value => SYSTEM_ACCESS_LABELS[value])
                  .join("、") || t("install.systemDefault")}
              </p>
              <p>{t("install.notice")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p>{t("install.notice")}</p>
              <Checkbox
                checked={skipNotice}
                onChange={event => setSkipNotice(event.target.checked)}
                label={<span className="whitespace-normal">{t("install.skip")}</span>}
              />
            </div>
          )
        }
        confirmText={t("common.install")}
        onConfirm={() => {
          if (confirm.kind === "plain" && skipNotice) saveSkipInstallNotice(true);
          start();
        }}
      />
    </span>
  );
}

export function RestartBar({ count }: { count: number }) {
  usePluginI18n();
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure
    ? failure.cause instanceof Error
      ? failure.cause.message
      : t("install.restartFailed")
    : "";
  if (count === 0) return null;
  return (
    <div className="bg-accent-soft text-accent-text text-tau-meta flex items-center gap-3 rounded-[var(--tau-radius-md)] px-3.5 py-2.5">
      <RotateCw className="size-4 flex-none" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{pluginCount("install.changes", count)}</b>
        {" · "}
        {t("install.changesHint")}
        {error && <span className="text-danger ml-2">{error}</span>}
      </span>
      <Button
        variant="primary"
        size="sm"
        onClick={() => void relaunchForPlugins().catch(cause => setFailure({ cause }))}
      >
        {t("install.restartNow")}
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
  usePluginI18n();
  const [purge, setPurge] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setPurge(false);
      }}
      danger
      title={t("install.uninstallTitle", { name })}
      description={
        <div className="flex flex-col gap-3">
          <p>{t("install.uninstallHint")}</p>
          <Checkbox
            checked={purge}
            onChange={event => setPurge(event.target.checked)}
            label={t("install.purge")}
          />
          <p className="text-ink-3">{t("install.keepData")}</p>
        </div>
      }
      confirmText={t("common.uninstall")}
      onConfirm={() => onConfirm(purge)}
    />
  );
}

export function MoreButton({ label, children }: { label: string; children: React.ReactNode }) {
  usePluginI18n();
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
