import { invoke } from "@tauri-apps/api/core";
import {
  normalizeCenterHost,
  normalizeCenterQuery,
  type CenterHost,
  type CenterRelease,
  type PluginCenterClient,
} from "@tau/plugins/center";
import { isPluginCapability } from "@tau/plugins/portable";
import { readPortablePluginManifest } from "@tau/plugins/portable";
import { cancelMobilePlugin, verifyMobilePlugin, type MobilePluginArtifact } from "./plugins";
import { markCenterStatusFailure, markCenterStatusRefresh } from "./pluginCenterState";

export interface MobileCenterConfig {
  browsingEnabled?: boolean;
  origin: string;
  host: CenterHost | null;
  installationEnabled: boolean;
}
export class MobileCenterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MobileCenterError";
  }
}
async function command<T>(
  name: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  try {
    const value = await invoke<T>(name, args);
    signal?.throwIfAborted();
    return value;
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted();
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      const issue = error as { status: number; code: string; message: string };
      throw new MobileCenterError(issue.status, issue.code, issue.message);
    }
    throw error;
  }
}
export async function readMobileCenterConfig() {
  const result = await command<MobileCenterConfig>("plugin_center_config");
  return { ...result, host: result.host ? normalizeCenterHost(result.host) : null };
}
export function createMobilePluginCenterClient(): PluginCenterClient {
  const request = <T>(input: Record<string, unknown>, signal?: AbortSignal) =>
    command<T>("plugin_center_request", { request: input }, signal);
  return {
    queryCatalog: (input, signal) =>
      request({ kind: "catalog", input: normalizeCenterQuery(input) }, signal),
    listReleases: (pluginId, input = {}, signal) =>
      request(
        {
          kind: "versions",
          pluginId,
          platform: input.platform ?? "all",
          cursor: input.cursor ?? null,
        },
        signal
      ),
    getRelease: (releaseId, signal) => request({ kind: "release", releaseId }, signal),
    resolve: (pluginId, input, signal) =>
      request(
        { kind: "resolve", pluginId, ...(input.releaseId ? { releaseId: input.releaseId } : {}) },
        signal
      ),
    statuses: (releaseIds, signal) => request({ kind: "statuses", releaseIds }, signal),
    download: async (releaseId, signal) => {
      const result = await request<{ base64: string }>({ kind: "download", releaseId }, signal);
      return new Blob([Uint8Array.from(atob(result.base64), char => char.charCodeAt(0))], {
        type: "application/zip",
      });
    },
  };
}
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
export async function installMobileCenterRelease(
  pluginId: string,
  releaseId: string,
  signal?: AbortSignal,
  onPhase?: (phase: "downloading" | "checking" | "pending") => void
) {
  signal?.throwIfAborted();
  const config = await readMobileCenterConfig();
  if (!config.host || !config.installationEnabled)
    throw new MobileCenterError(403, "DISTRIBUTION_UNAVAILABLE", "当前构建未开放插件安装");
  signal?.throwIfAborted();
  onPhase?.("downloading");
  const staged = await command<{
    artifact: MobilePluginArtifact;
    sha256: string;
    release: CenterRelease;
  }>("plugin_center_stage", { pluginId, releaseId });
  try {
    signal?.throwIfAborted();
    onPhase?.("checking");
    if (
      staged.release.releaseId !== releaseId ||
      staged.release.pluginId !== pluginId ||
      staged.release.sha256 !== staged.sha256 ||
      staged.release.content.manifest.formatVersion !== 3
    )
      throw new Error("暂存包与中心发布记录不一致");
    const artifact = await verifyMobilePlugin(
      staged.artifact,
      {
        platform: config.host.platform,
        input: { coarsePointer: false, finePointer: false },
      },
      config.host.appVersion,
      config.host.capabilities.filter(isPluginCapability)
    );
    if (
      canonical(artifact.manifest) !==
      canonical(readPortablePluginManifest(staged.release.content.manifest))
    )
      throw new Error("包清单与审核记录不一致");
    signal?.throwIfAborted();
    await command("plugin_center_commit", { pluginId, releaseId, sha256: staged.sha256 });
    signal?.throwIfAborted();
    onPhase?.("pending");
  } catch (error) {
    await cancelMobilePlugin(pluginId);
    throw error;
  }
}
export async function refreshMobileCenterInstallations() {
  try {
    const result = await command<{ origin: string; blockedPluginIds: string[] }>(
      "plugin_center_refresh"
    );
    markCenterStatusRefresh(result.origin);
    return result;
  } catch (error) {
    markCenterStatusFailure();
    throw error;
  }
}
