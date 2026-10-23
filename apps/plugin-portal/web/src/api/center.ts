import {
  normalizeCenterHost,
  normalizeCenterQuery,
  type PluginCenterClient,
} from "@tau/plugins/center";

export function createPortalCenterClient(transport: {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  download(path: string, signal?: AbortSignal): Promise<Blob>;
}): PluginCenterClient {
  const id = (value: string) => {
    if (!/^[\w.-]{1,128}$/.test(value)) throw new Error("插件或版本标识无效");
    return encodeURIComponent(value);
  };
  const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
    transport.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  return {
    queryCatalog: (input, signal) => post("/v2/catalog/query", normalizeCenterQuery(input), signal),
    listReleases: (pluginId, input = {}, signal) => {
      const query = normalizeCenterQuery({
        platform: input.platform ?? "all",
        cursor: input.cursor,
      });
      return transport.request(
        `/v2/plugins/${id(pluginId)}/releases?${new URLSearchParams({ platform: query.platform, ...(query.cursor ? { cursor: query.cursor } : {}) })}`,
        { signal }
      );
    },
    getRelease: (releaseId, signal) =>
      transport.request(`/v2/releases/${id(releaseId)}`, { signal }),
    resolve: (pluginId, input, signal) =>
      post(
        `/v2/plugins/${id(pluginId)}/resolve`,
        {
          host: normalizeCenterHost(input.host),
          ...(input.releaseId ? { releaseId: id(input.releaseId) } : {}),
        },
        signal
      ),
    statuses: (releaseIds, signal) => {
      if (!Array.isArray(releaseIds) || releaseIds.length > 100)
        throw new Error("每次最多查询 100 个版本");
      return post("/v2/releases/status", { releaseIds: [...new Set(releaseIds.map(id))] }, signal);
    },
    download: (releaseId, signal) =>
      transport.download(`/v2/releases/${id(releaseId)}/download`, signal),
  };
}
