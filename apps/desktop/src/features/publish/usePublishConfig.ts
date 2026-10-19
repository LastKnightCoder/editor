import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { toast } from "@tau/ui";
import type { JsonValue } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { rendererPublishRegistry } from "@/app/plugins/publish-registry";
import {
  listPublishTemplates,
  describePublishTarget,
  checkPublishConnection,
  savePublishPluginConfig,
} from "@/commands/publish";
import {
  createDir,
  getFileBaseName,
  getFileExtension,
  getUserDataDir,
  pathExists,
  readBinaryFile,
  removeFile,
  selectFile,
  writeBinaryFile,
} from "@/commands";
import {
  buildPublishFaviconCachePath,
  buildPublishFaviconCachePaths,
  createPublishFaviconConfig,
  getParentDirFromPath,
  normalizePublishFaviconExtension,
} from "@/utils/publishFavicon";
import type { IPublishFaviconConfig } from "@/types/publish";

export const PROVIDER_LABELS: Record<EPublishProvider, string> = {
  [EPublishProvider.Plugin]: "发布插件",
  [EPublishProvider.Local]: "本地导出",
};
export type ConnectionState = "idle" | "checking" | "ok" | "fail";
const isUserCanceled = (error: unknown) =>
  error instanceof Error && error.message === "User canceled file selection";
const updateSetting = (
  recipe: (draft: ReturnType<typeof useSettingStore.getState>["setting"]) => void
) => useSettingStore.setState(s => ({ setting: produce(s.setting, recipe) }));

export function usePublishConfig() {
  const runtime = useDesktopPlugins();
  const revision = useSyncExternalStore(
    rendererPublishRegistry.subscribe,
    rendererPublishRegistry.getRevision
  );
  const client = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["publish", "templates"],
    queryFn: listPublishTemplates,
    refetchOnWindowFocus: true,
  });
  const setting = useSettingStore(s => s.setting);
  const { publish } = setting;
  const active = publish.active;
  const pluginId = publish.plugin.id;
  const providers = rendererPublishRegistry.list();
  const provider = providers.find(item => item.id === pluginId);
  const providerConfig = useMemo(
    () => copyJson(publish.plugin.configurations[pluginId] ?? {}),
    [publish.plugin.configurations, pluginId]
  );
  const request = useMemo(
    () => ({
      providerType: active,
      pluginId,
      providerConfig,
      basePath: publish.local.basePath,
      siteConfig: publish.site,
    }),
    [active, pluginId, providerConfig, publish.local.basePath, publish.site]
  );
  const targetQuery = useQuery({
    queryKey: [
      "publish",
      "target",
      active,
      pluginId,
      providerConfig,
      publish.local.basePath,
      publish.site.publicUrl,
      revision,
    ],
    queryFn: () => describePublishTarget(request),
    enabled: active === EPublishProvider.Local || Boolean(provider),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const targetReady = active === EPublishProvider.Local || Boolean(provider && targetQuery.data);
  const providerLabel =
    active === EPublishProvider.Local
      ? "本地导出"
      : (provider?.name ?? (pluginId || "未选择发布插件"));
  const section = runtime
    ?.listSettings()
    .find(item => item.context.pluginId === pluginId && item.definition.target === "publish");
  const setProvider = (value: string) =>
    updateSetting(draft => {
      draft.publish.active = value === "local" ? EPublishProvider.Local : EPublishProvider.Plugin;
      if (value !== "local") draft.publish.plugin.id = value;
    });
  const setSiteField = (
    field: "title" | "description" | "publicUrl" | "templateId",
    value: string
  ) =>
    updateSetting(draft => {
      draft.publish.site[field] = value;
    });
  const setLocalBasePath = (value: string) =>
    updateSetting(draft => {
      draft.publish.local.basePath = value;
    });
  const saveConfig = async (value: JsonValue) => {
    await savePublishPluginConfig(pluginId, value);
    updateSetting(draft => {
      draft.publish.plugin.configurations[pluginId] = value;
    });
    await client.invalidateQueries({ queryKey: ["publish", "target"] });
  };
  /* ── favicon：选择后缓存本地 ── */
  const setFavicon = (favicon?: IPublishFaviconConfig) =>
    updateSetting(draft => {
      draft.publish.site.favicon = favicon;
    });

  const removeCachedFaviconFiles = async () => {
    const userDataDir = await getUserDataDir();
    const targets = buildPublishFaviconCachePaths(userDataDir);
    await Promise.all(
      targets.map(async targetPath => {
        if (await pathExists(targetPath)) await removeFile(targetPath);
      })
    );
  };

  const selectFavicon = async () => {
    try {
      const paths = await selectFile({
        properties: ["openFile"],
        filters: [{ name: "Favicon", extensions: ["svg", "png", "ico"] }],
      });
      if (!paths || paths.length === 0) return;
      const filePath = paths[0];
      const extension = normalizePublishFaviconExtension(await getFileExtension(filePath));
      if (!extension) {
        toast.error("仅支持 SVG、PNG、ICO 格式的 favicon");
        return;
      }
      const userDataDir = await getUserDataDir();
      const cachePath = buildPublishFaviconCachePath(userDataDir, extension);
      // 先读源文件成功、再删旧缓存，避免中途失败后新旧皆失
      const content = await readBinaryFile(filePath);
      await createDir(getParentDirFromPath(cachePath));
      await removeCachedFaviconFiles();
      await writeBinaryFile(cachePath, content);
      setFavicon(
        createPublishFaviconConfig({
          cachePath,
          fileName: await getFileBaseName(filePath),
          format: extension,
        })
      );
      toast.success("已缓存发布 favicon");
    } catch (error) {
      if (isUserCanceled(error)) return;
      toast.error(`选择 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearFavicon = async () => {
    try {
      await removeCachedFaviconFiles();
      setFavicon(undefined);
      toast.success("已清除自定义 favicon");
    } catch (error) {
      toast.error(`清除 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const [connectionResult, setConnectionResult] = useState<{
    key: string;
    value: ConnectionState;
  }>();
  const connectionKey = JSON.stringify([pluginId, providerConfig, revision]);
  const connection = connectionResult?.key === connectionKey ? connectionResult.value : "idle";
  const checkConnection = async () => {
    setConnectionResult({ key: connectionKey, value: "checking" });
    try {
      const connected = await checkPublishConnection(request);
      setConnectionResult({ key: connectionKey, value: connected ? "ok" : "fail" });
    } catch (error) {
      setConnectionResult({ key: connectionKey, value: "fail" });
      toast.error(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return {
    publish,
    active,
    appearance: setting.appearance,
    providerLabel,
    providerConfig,
    pluginId,
    request,
    providers,
    section,
    saveConfig,
    credentialReady: targetReady,
    targetReady,
    targetError:
      targetQuery.error instanceof Error
        ? targetQuery.error.message
        : !provider && active === EPublishProvider.Plugin
          ? "请安装并启用已选择的发布插件"
          : "",
    basePath: targetQuery.data?.basePath ?? publish.local.basePath,
    siteUrl: publish.site.publicUrl.trim() || targetQuery.data?.publicUrl || "",
    templateReady: Boolean(
      templatesQuery.data?.some(template => template.id === publish.site.templateId)
    ),
    templateOptions: (templatesQuery.data ?? []).map(template => ({
      label: `${template.name} · ${template.version}`,
      value: template.id,
    })),
    templateError: templatesQuery.error instanceof Error ? templatesQuery.error.message : "",
    setProvider,
    setSiteField,
    setLocalBasePath,
    selectFavicon,
    clearFavicon,
    connection,
    checkConnection,
  };
}
export type PublishConfig = ReturnType<typeof usePublishConfig>;
