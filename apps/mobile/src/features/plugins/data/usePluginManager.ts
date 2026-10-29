import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMobilePlugins } from "../../../app/plugins/context";
import {
  MOBILE_PLUGIN_QUERY,
  readMobilePlugins,
  clearMobilePluginData,
  installMobilePlugin,
  setMobilePluginEnabled,
  removeMobilePlugin,
  restoreMobilePlugin,
  cancelMobilePlugin,
  type MobilePluginPackage,
} from "../../../services/plugins";
import type { MobilePluginRuntime } from "../../../app/plugins/runtime";
import { isSkillPackageManifest } from "@tau/plugins/template";
import { readDevelopmentPluginSource } from "../../../services/plugins";
import { getMobileCenterInstallStore } from "../../../app/plugins/center-install";

export type PluginManagerAction =
  "enable" | "disable" | "uninstall" | "restore" | "clearData" | "cancelPending";
export interface PluginActionAvailability {
  allowed: boolean;
  reason: string | null;
}
export interface ManagedPluginItem {
  permissions?: readonly string[];
  retryAvailable?: boolean;
  pendingVersion?: string | null;
  revoked?: MobilePluginPackage["revoked"];
  statusStale?: boolean;
  centerSource?: MobilePluginPackage["centerSource"];
  blocked?: boolean;
  id: string;
  name: string;
  version: string | null;
  enabled: boolean;
  active: boolean;
  pending: boolean;
  editor: boolean;
  error: string | null;
  hasBackup: boolean;
  settings: { id: string; title: string }[];
  actions: Record<PluginManagerAction, PluginActionAvailability>;
}
export const pluginManagerKey = (workspace: string | null) =>
  [...MOBILE_PLUGIN_QUERY, "manager", workspace] as const;
const permission = (reason: string | null): PluginActionAvailability => ({
  allowed: reason === null,
  reason,
});

export function projectManagedPlugin(
  item: MobilePluginPackage,
  runtime: MobilePluginRuntime | null,
  blocked: string | null
): ManagedPluginItem {
  const standalone = item.artifact && isSkillPackageManifest(item.artifact.manifest);
  const active = standalone ? (runtime?.isSkillPackageActive(item.id) ?? false) : (runtime?.isPluginActive(item.id) ?? false);
  const error =
    item.error || runtime?.errors.get(item.id) || (item.blocked ? "中心版本不可用" : null);
  const unavailable = !runtime || !runtime.isAvailable ? "插件会话未就绪" : null;
  const inactive = active ? "请先停用插件并点「立即生效」后再操作" : null;
  return {
    permissions: item.artifact && !isSkillPackageManifest(item.artifact.manifest) ? (item.artifact.manifest.permissions ?? []) : [],
    pendingVersion: item.pendingVersion ?? null,
    revoked: item.revoked ?? null,
    statusStale: item.statusStale ?? false,
    centerSource: item.centerSource,
    blocked: !!item.blocked,
    id: item.id,
    name: item.name ?? item.artifact?.manifest.name ?? item.id,
    version:
      item.currentVersion === undefined
        ? (item.artifact?.manifest.version ?? null)
        : item.currentVersion,
    enabled: item.enabled,
    active,
    pending: !!item.pending,
    editor: (runtime?.contributions(item.id).elements ?? 0) > 0,
    error,
    hasBackup: !!item.hasBackup,
    settings: [...(runtime?.settings.entries() ?? [])]
      .filter(([, entry]) => entry.context.pluginId === item.id && entry.definition.target !== "asr" && runtime?.active(entry.context))
      .map(([id, entry]) => ({ id, title: entry.definition.title })),
    actions: {
      enable: permission(blocked || error || (item.enabled ? "已保存启用意图" : null)),
      disable: permission(blocked || (!item.enabled && !error ? "已保存停用意图" : null)),
      uninstall: permission(blocked || unavailable || inactive),
      restore: permission(
        blocked || unavailable || inactive || (!item.hasBackup ? "没有备份代码" : null)
      ),
      clearData: permission(blocked || unavailable || inactive),
      cancelPending: permission(blocked || (!item.pending ? "没有待生效更新" : null)),
    },
  };
}

type ManagerCommand =
  { kind: PluginManagerAction; id: string } | { kind: "installDevelopment"; source: string };

export function usePluginManager() {
  const runtime = useMobilePlugins();
  const client = useQueryClient();
  const centerInstall = getMobileCenterInstallStore(client);
  const centerTasks = useSyncExternalStore(
    centerInstall.subscribe,
    centerInstall.getSnapshot,
    centerInstall.getSnapshot
  );
  const query = useQuery({
    queryKey: pluginManagerKey(runtime?.workspaceId ?? null),
    queryFn: readMobilePlugins,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!runtime?.isAvailable || !query.data) return;
    void runtime.reconcileSkillPackages(query.data.packages).catch(() => undefined);
  }, [runtime, query.data]);
  const [operation, setOperation] = useState<{
    kind: ManagerCommand["kind"];
    id: string | null;
  } | null>(null);
  const lock = useRef(false);
  const operationRuntime = useRef<MobilePluginRuntime | null>(runtime);
  const activeInstall = useRef<{
    id: string;
    owner: MobilePluginRuntime;
    controller: AbortController;
  } | null>(null);
  const mounted = useRef(true);
  const current = useRef({ runtime, query });
  current.current = { runtime, query };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeInstall.current?.controller.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (activeInstall.current?.owner === runtime) activeInstall.current.controller.abort();
    },
    [runtime]
  );
  const blockedReason = () => {
    const value = current.current.query;
    if (!(value.data?.managementEnabled ?? value.data?.development)) return "当前构建未开放插件管理操作";
    if (value.isError || value.isPending) return "请先刷新插件清单";
    return null;
  };
  const mutation = useMutation({
    mutationFn: async ({
      command,
      owner,
    }: {
      command: ManagerCommand;
      owner: MobilePluginRuntime | null;
    }) => {
      const runtime = owner;
      if (
        !mounted.current ||
        current.current.runtime !== runtime ||
        (runtime && !runtime.isAvailable)
      )
        throw new Error("插件会话已失效");
      const blocked = blockedReason();
      if (blocked) throw new Error(blocked);
      if (command.kind === "installDevelopment") {
        if (!import.meta.env.DEV || !current.current.query.data?.development)
          throw new Error("正式构建不允许任意开发来源安装");
        if (!runtime) throw new Error("插件宿主未就绪");
        const source = readDevelopmentPluginSource(command.source);
        const controller = new AbortController();
        activeInstall.current = { id: source.id, owner: runtime, controller };
        setOperation({ kind: command.kind, id: source.id });
        try {
          await installMobilePlugin(
            source,
            runtime.environment.getSnapshot(),
            runtime.appVersion,
            controller.signal
          );
          controller.signal.throwIfAborted();
        } finally {
          activeInstall.current = null;
        }
        return;
      }
      const item = current.current.query.data?.packages.find(value => value.id === command.id);
      if (!item) throw new Error("插件不在当前清单，请刷新后重试");
      const action = projectManagedPlugin(item, runtime, null).actions[command.kind];
      if (!action.allowed) throw new Error(action.reason ?? "操作不可用");
      switch (command.kind) {
        case "enable":
          return setMobilePluginEnabled(item.id, true);
        case "disable":
          await setMobilePluginEnabled(item.id, false);
          runtime?.revokeSkillPackage(item.id);
          return;
        case "uninstall":
          return removeMobilePlugin(item.id);
        case "restore":
          return restoreMobilePlugin(item.id);
        case "cancelPending":
          return cancelMobilePlugin(item.id);
        case "clearData": {
          if (!runtime) throw new Error("插件会话未就绪");
          return clearMobilePluginData(runtime.workspaceId, item.id);
        }
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY }),
  });
  const cancellation = useMutation({
    mutationFn: async (installation: NonNullable<typeof activeInstall.current>) => {
      if (
        !mounted.current ||
        current.current.runtime !== installation.owner ||
        !installation.owner.isAvailable
      )
        throw new Error("插件会话已失效");
      if (activeInstall.current !== installation) throw new Error("安装操作已结束");
      installation.controller.abort();
      await cancelMobilePlugin(installation.id);
    },
    onSettled: () => client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY }),
  });
  async function execute(command: ManagerCommand) {
    if (!mounted.current || current.current.runtime !== runtime) throw new Error("插件会话已失效");
    if (lock.current) throw new Error("已有插件操作正在进行");
    lock.current = true;
    operationRuntime.current = runtime;
    cancellation.reset();
    setOperation({ kind: command.kind, id: "id" in command ? command.id : null });
    try {
      await mutation.mutateAsync({ command, owner: runtime });
    } finally {
      lock.current = false;
      if (mounted.current) setOperation(null);
    }
  }
  const blocked = blockedReason() || (operation ? "已有插件操作正在进行" : null);
  return {
    managementEnabled: (query.data?.managementEnabled ?? query.data?.development) === true,
    items:
      query.data?.packages.map(item => ({
        ...projectManagedPlugin(item, runtime, blocked),
        retryAvailable: centerTasks.get(item.id)?.status === "error",
      })) ?? [],
    centerTasks,
    loading: query.isPending,
    refreshing: query.isFetching,
    error: query.error,
    actionError:
      operationRuntime.current === runtime ? (cancellation.error ?? mutation.error) : null,
    saved: operationRuntime.current === runtime && mutation.isSuccess && !operation,
    operation,
    busy: !!operation,
    refresh: query.refetch,
    developmentInstall: permission(blocked || (!import.meta.env.DEV || !query.data?.development ? "正式构建不允许任意开发来源安装" : null) || (!runtime?.isAvailable ? "插件宿主未就绪" : null)),
    canCancelInstall:
      operationRuntime.current === runtime &&
      operation?.kind === "installDevelopment" &&
      !!operation.id &&
      !cancellation.isPending,
    actions: {
      retryCenter: (pluginId: string) => centerInstall.retry(pluginId),
      run: (kind: PluginManagerAction, id: string) => execute({ kind, id }),
      installDevelopment: (source: string) => execute({ kind: "installDevelopment", source }),
      cancelInstall: async () => {
        const installation = activeInstall.current;
        if (!installation || installation.owner !== runtime)
          throw new Error("没有当前会话的安装操作");
        await cancellation.mutateAsync(installation);
      },
    },
  };
}
