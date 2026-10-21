import type {
  DataClient,
  DataManifest,
  PublishedData,
  SearchDocument,
  SearchFile,
  SearchHit,
  SearchMatch,
} from "./publish-data";

export class DataError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "DataError";
  }
}

function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DataError(code, message);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resourceUrl(relative: string, base: string): string {
  assert(
    typeof relative === "string" &&
      !!relative &&
      !/[\\:%?#]/.test(relative) &&
      relative.split("/").every(part => part && part !== "." && part !== ".."),
    "INVALID_DATA",
    "数据资源路径无效"
  );
  return new URL(relative, base).href;
}

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("读取已取消", "AbortError");
}

async function waitFor<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  cancelled(signal);
  if (!signal) return pending;
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new DOMException("读取已取消", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export function createClient({ manifestUrl }: { manifestUrl: string }): DataClient {
  const origin = new URL(manifestUrl).href;
  const cache = new Map<string, Promise<unknown>>();
  let manifestPromise: Promise<DataManifest> | undefined;
  let searchPromise: Promise<SearchFile> | undefined;
  // 索引文件不变时复用同一个检索引擎，避免每次输入都重建全文索引。
  let engine:
    { documents: SearchDocument[]; fuse: import("fuse.js").default<SearchDocument> } | undefined;

  function json(url: string, expected: string): Promise<unknown> {
    assert(/^[a-f0-9]{64}$/.test(expected), "INVALID_DATA", "摘要格式错误");
    const filenameHash = new URL(url).pathname.match(/\.([a-f0-9]{64})\.json$/)?.[1];
    assert(filenameHash === expected, "INTEGRITY_MISMATCH", "文件名与声明摘要不一致");
    let pending = cache.get(url);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(url);
        if (!response.ok)
          throw new DataError("RESOURCE_LOAD_FAILED", `HTTP ${response.status}：${url}`);
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map(byte => byte.toString(16).padStart(2, "0"))
          .join("");
        assert(digest === expected, "INTEGRITY_MISMATCH", `资源摘要错误：${url}`);
        try {
          return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        } catch {
          throw new DataError("INVALID_DATA", `JSON 无效：${url}`);
        }
      })().catch(error => {
        cache.delete(url);
        if (error instanceof DataError) throw error;
        throw new DataError("RESOURCE_LOAD_FAILED", String(error));
      });
      cache.set(url, pending);
    }
    return pending;
  }

  function manifest(): Promise<DataManifest> {
    if (!manifestPromise) {
      manifestPromise = (async () => {
        const hash = new URL(origin).pathname.match(/site\.([a-f0-9]{64})\.json$/)?.[1];
        assert(hash, "INVALID_DATA", "清单 URL 缺少摘要");
        const value = await json(origin, hash);
        assert(record(value), "INVALID_DATA", "清单必须是对象");
        assert(value.version === 1, "PROTOCOL_MISMATCH", "数据协议版本不匹配");
        assert(
          record(value.site) && Array.isArray(value.items) && record(value.search),
          "INVALID_DATA",
          "清单字段缺失"
        );
        const keys = new Set<string>();
        assert(
          typeof value.site.title === "string" &&
            typeof value.site.basePath === "string" &&
            record(value.site.fields) &&
            Object.values(value.site.fields).every(
              field => typeof field === "string" || typeof field === "boolean"
            ),
          "INVALID_DATA",
          "站点数据缺失"
        );
        for (const item of value.items) {
          assert(
            record(item) && typeof item.key === "string" && typeof item.type === "string",
            "INVALID_DATA",
            "数据身份缺失"
          );
          assert(!keys.has(item.key), "INVALID_DATA", "清单 key 重复");
          assert(
            typeof item.data === "string" && typeof item.integrity === "string",
            "INVALID_DATA",
            "数据文件引用缺失"
          );
          keys.add(item.key);
          assert(
            ["home", "card", "article", "doc", "quest", "list"].includes(String(item.type)) &&
              typeof item.title === "string",
            "INVALID_DATA",
            "数据类型或标题无效"
          );
          resourceUrl(item.data as string, origin);
          assert(/^[a-f0-9]{64}$/.test(item.integrity as string), "INVALID_DATA", "数据摘要无效");
        }
        assert(
          typeof value.search.data === "string" && typeof value.search.integrity === "string",
          "INVALID_DATA",
          "索引引用缺失"
        );
        resourceUrl(value.search.data as string, origin);
        assert(
          /^[a-f0-9]{64}$/.test(value.search.integrity as string),
          "INVALID_DATA",
          "索引摘要无效"
        );
        return value as unknown as DataManifest;
      })().catch(error => {
        manifestPromise = undefined;
        cache.delete(origin);
        throw error;
      });
    }
    return manifestPromise;
  }

  function index(): Promise<SearchFile> {
    if (!searchPromise) {
      searchPromise = (async () => {
        const source = await manifest();
        const url = resourceUrl(source.search.data, origin);
        const value = await json(url, source.search.integrity);
        assert(record(value), "INVALID_DATA", "索引必须是对象");
        assert(value.version === 1, "PROTOCOL_MISMATCH", "索引版本不匹配");
        assert(Array.isArray(value.documents), "INVALID_DATA", "索引缺少 documents");
        const seen = new Set<string>();
        for (const document of value.documents) {
          assert(
            record(document) && typeof document.key === "string",
            "INVALID_DATA",
            "搜索身份无效"
          );
          const item = source.items.find(item => item.key === document.key);
          assert(
            item && item.type === document.type && !seen.has(document.key),
            "INVALID_DATA",
            "搜索 key 未闭合或重复"
          );
          assert(
            ["card", "article", "doc", "quest"].includes(String(document.type)),
            "INVALID_DATA",
            "搜索类型错误"
          );
          assert(
            ["title", "summary", "content"].every(field => typeof document[field] === "string"),
            "INVALID_DATA",
            "搜索文本缺失"
          );
          assert(
            Array.isArray(document.tags) && document.tags.every(tag => typeof tag === "string"),
            "INVALID_DATA",
            "搜索标签无效"
          );
          seen.add(document.key);
        }
        return value as unknown as SearchFile;
      })().catch(error => {
        searchPromise = undefined;
        if (manifestPromise)
          void manifestPromise.then(
            source => cache.delete(resourceUrl(source.search.data, origin)),
            () => undefined
          );
        throw error;
      });
    }
    return searchPromise;
  }

  return {
    async readManifest({ signal } = {}) {
      cancelled(signal);
      return waitFor(manifest(), signal);
    },
    async readData({ key, signal }) {
      cancelled(signal);
      const source = await waitFor(manifest(), signal);
      const item = source.items.find(item => item.key === key);
      assert(item, "DATA_NOT_FOUND", `未发布内容：${key}`);
      const dataUrl = resourceUrl(item.data, origin);
      const value = await waitFor(json(dataUrl, item.integrity), signal);
      assert(
        record(value) && record(value.meta) && record(value.content),
        "INVALID_DATA",
        "内容结构错误"
      );
      assert(value.version === 1, "PROTOCOL_MISMATCH", "内容协议版本不匹配");
      assert(
        value.key === key &&
          value.meta.type === item.type &&
          (item.id === undefined || value.content.id === undefined || value.content.id === item.id),
        "IDENTITY_MISMATCH",
        "内容身份不匹配"
      );
      return {
        data: value as unknown as PublishedData,
        dataUrl,
        ...(source.settings ? { settings: source.settings } : {}),
      };
    },
    async search(query, { limit = 12, signal } = {}) {
      cancelled(signal);
      const normalized = query.replace(/\s+/g, " ").trim();
      if (!normalized) return [];
      assert(Number.isInteger(limit) && limit > 0, "INVALID_DATA", "limit 必须是正整数");
      const [{ documents }, { default: Fuse }] = await waitFor(
        Promise.all([index(), import("fuse.js")]),
        signal
      );
      cancelled(signal);
      if (engine?.documents !== documents)
        engine = {
          documents,
          fuse: new Fuse(documents, {
            keys: ["title", "summary", "content", "tags"],
            includeMatches: true,
            threshold: 0.3,
            ignoreLocation: true,
          }),
        };
      return engine.fuse.search(normalized, { limit }).map(({ item, matches }) => {
        const { content: _content, ...hit } = item;
        const ranges: SearchMatch[] = (matches ?? []).flatMap(match => {
          if (!match.value || !["title", "summary", "content", "tags"].includes(match.key ?? ""))
            return [];
          return [
            {
              field: match.key as SearchMatch["field"],
              text: match.value,
              ranges: match.indices.map(([start, end]) => [start, end + 1] as [number, number]),
            },
          ];
        });
        return { ...hit, matches: ranges } satisfies SearchHit;
      });
    },
  };
}
