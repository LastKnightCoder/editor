import {
  evaluateCenterCompatibility,
  normalizeCenterQuery,
  resolveCenterRelease,
  type CenterRelease,
  type PluginCenterClient,
  type CenterCatalogEntry,
} from "@tau/plugins/center";
import { comparePluginVersions } from "@tau/plugins/package";
import { PortalApiError } from "../errors";

/** 只由显式模拟模式或测试调用；不生成真实可安装 ZIP。 */
export function createCenterMock(
  source: readonly CenterRelease[] | (() => readonly CenterRelease[]) = []
): PluginCenterClient {
  const releases = () => (typeof source === "function" ? source() : source);
  const visible = (platform: string) =>
    releases().filter(release => platform === "all" || Object.hasOwn(release.targets, platform));
  const ordered = (items: readonly CenterRelease[]) =>
    [...items].sort((a, b) => comparePluginVersions(b.version, a.version));
  const get = (id: string) => {
    const release = releases().find(item => item.releaseId === id);
    if (!release) throw new PortalApiError(404, "NOT_FOUND", "找不到模拟版本");
    return structuredClone(release);
  };
  return {
    async queryCatalog(input, signal) {
      signal?.throwIfAborted();
      const query = normalizeCenterQuery(input);
      const scope = JSON.stringify({ ...query, cursor: null });
      let offset = 0;
      if (query.cursor) {
        const cursor = JSON.parse(query.cursor);
        if (cursor.scope !== scope || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0)
          throw new Error("模拟游标与查询不一致");
        offset = cursor.offset;
      }
      const platformCounts = { all: 0, desktop: 0, android: 0, ios: 0 };
      if (!query.cursor)
        for (const platform of ["all", "desktop", "android", "ios"] as const) {
          const latest = new Map<string, CenterRelease>();
          for (const release of ordered(visible(platform)))
            if (!latest.has(release.pluginId)) latest.set(release.pluginId, release);
          platformCounts[platform] = [...latest.values()].filter(release => {
            const manifest = release.content.manifest;
            return (
              [release.pluginId, manifest.name, manifest.description, ...(manifest.keywords ?? [])]
                .join("\n")
                .toLowerCase()
                .includes(query.q) &&
              (!query.category || manifest.categories?.includes(query.category))
            );
          }).length;
        }
      const grouped = new Map<string, CenterRelease[]>();
      for (const release of ordered(visible(query.platform)))
        grouped.set(release.pluginId, [...(grouped.get(release.pluginId) ?? []), release]);
      const entries: CenterCatalogEntry[] = [];
      for (const [pluginId, versions] of grouped) {
        const latest = versions[0];
        const manifest = latest.content.manifest;
        if (
          !`${pluginId}\n${manifest.name}\n${manifest.description}\n${manifest.keywords?.join(" ") ?? ""}`
            .toLowerCase()
            .includes(query.q)
        )
          continue;
        const resolution = query.host ? resolveCenterRelease(versions, { host: query.host }) : null;
        entries.push({
          pluginId,
          name: manifest.name,
          description: manifest.description,
          categories: manifest.categories ?? [],
          keywords: manifest.keywords ?? [],
          publisher: latest.publisher,
          repository: latest.repository,
          downloadsTotal: 0,
          downloads7d: 0,
          likes: 0,
          latest,
          compatible: resolution?.release ?? null,
          compatibility: resolution?.compatibility ?? evaluateCenterCompatibility(latest),
        });
      }
      const counts: Partial<Record<import("@tau/plugins/package").PluginCategory, number>> = {};
      for (const entry of entries)
        for (const category of entry.categories) counts[category] = (counts[category] ?? 0) + 1;
      const filtered = entries
        .filter(entry => !query.category || entry.categories.includes(query.category))
        .sort(
          (a, b) =>
            b.latest.publishedAt.localeCompare(a.latest.publishedAt) ||
            a.pluginId.localeCompare(b.pluginId)
        );
      return structuredClone({
        items: filtered.slice(offset, offset + query.limit),
        nextCursor:
          offset + query.limit < filtered.length
            ? JSON.stringify({ scope, offset: offset + query.limit })
            : null,
        windowStart: "2026-10-17",
        categoryCounts: query.cursor ? null : counts,
        platformCounts: query.cursor ? null : platformCounts,
      });
    },
    async listReleases(pluginId, input = {}, signal) {
      signal?.throwIfAborted();
      if (input.cursor) throw new Error("模拟版本列表只有一页");
      return {
        items: structuredClone(
          ordered(visible(input.platform ?? "all").filter(item => item.pluginId === pluginId))
        ),
        nextCursor: null,
      };
    },
    async getRelease(id, signal) {
      signal?.throwIfAborted();
      return get(id);
    },
    async resolve(pluginId, input, signal) {
      signal?.throwIfAborted();
      return structuredClone(
        resolveCenterRelease(
          releases().filter(item => item.pluginId === pluginId),
          input
        )
      );
    },
    async statuses(ids, signal) {
      signal?.throwIfAborted();
      if (ids.length > 100) throw new Error("每次最多查询 100 个版本");
      return {
        items: [...new Set(ids)].map(releaseId => ({
          releaseId,
          status: releases().some(item => item.releaseId === releaseId)
            ? ("available" as const)
            : ("not_found" as const),
          reason: null,
        })),
      };
    },
    async download() {
      throw new PortalApiError(409, "INVALID_INPUT", "模拟目录不提供可安装 ZIP");
    },
  };
}
