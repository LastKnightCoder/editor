import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const serialize = value => JSON.stringify(value);

export async function checkProtocol(createClient, siteUrl, packet) {
  const cases = [];
  const originalFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = (...args) => {
    calls.push(String(args[0]));
    return originalFetch(...args);
  };
  try {
    const client = createClient({ manifestUrl: new URL(packet.manifestPath, siteUrl).href });
    assert.equal(calls.length, 0);
    assert.deepEqual(await client.search("  "), []);
    assert.equal(calls.length, 0);
    cases.push("创建客户端及空查询均为零请求");
    const first = await client.readData({ key: "article:1" });
    assert.deepEqual(Object.keys(first).sort(), ["data", "dataUrl", "settings"]);
    assert.equal(first.data.key, "article:1");
    cases.push("首调 readData 无需先调用 readManifest，返回字段固定");
    const fresh = createClient({ manifestUrl: new URL(packet.manifestPath, siteUrl).href });
    const hits = await fresh.search("共享协议", { limit: 2 });
    assert.equal(hits.length, 2);
    for (const hit of hits) {
      assert(!("href" in hit) && !("content" in hit));
      assert.equal((await fresh.readData({ key: hit.key })).data.key, hit.key);
      for (const match of hit.matches ?? [])
        for (const [start, end] of match.ranges) {
          assert(start >= 0 && start < end && end <= match.text.length);
        }
    }
    cases.push("首调 search 惰性初始化、limit 与命中区间有效，结果可按 key 读取");
    const manifest = await client.readManifest();
    const kinds = new Set();
    for (const item of manifest.items)
      kinds.add((await client.readData({ key: item.key })).data.meta.type);
    assert.deepEqual([...kinds].sort(), ["article", "card", "doc", "home", "list", "quest"]);
    const target = first.data.links["project-item:34"];
    assert(!("settings" in first.data) && first.settings === manifest.settings);
    assert.equal((await client.readData({ key: target.key })).data.meta.type, "doc");
    assert(!manifest.items.some(item => "href" in item));
    cases.push("六类数据、ContentRef 映射及无公开页面的目标读取闭合");
    const raw = await (
      await originalFetch(new URL(manifest.search.data, new URL(packet.manifestPath, siteUrl)))
    ).json();
    assert.equal(raw.version, 1);
    assert(raw.documents.filter(item => item.content.includes("共享协议")).length > 0);
    for (const item of raw.documents) assert(manifest.items.some(ref => ref.key === item.key));
    cases.push("仅用公开 version/documents 即可自行检索");
    await assert.rejects(client.readData({ key: "does-not-exist" }), { code: "DATA_NOT_FOUND" });
    await assert.rejects(client.search("共享协议", { limit: 0 }), { code: "INVALID_DATA" });
    const preCancelled = new AbortController();
    preCancelled.abort();
    await assert.rejects(client.readData({ key: "article:1", signal: preCancelled.signal }), {
      name: "AbortError",
    });
    cases.push("未知 key、非法 limit 和预取消请求明确失败");
    calls = [];
    const shared = createClient({ manifestUrl: new URL(packet.manifestPath, siteUrl).href });
    const controller = new AbortController();
    const abandoned = shared.readData({ key: "article:3", signal: controller.signal });
    const survivor = shared.readData({ key: "article:3" });
    controller.abort();
    await assert.rejects(abandoned, { name: "AbortError" });
    assert.equal((await survivor).data.key, "article:3");
    assert.equal(calls.filter(url => url.includes("/articles/3.")).length, 1);
    cases.push("并发读取共享请求，取消一个调用不影响另一个");
  } finally {
    globalThis.fetch = originalFetch;
  }

  function memoryPackage({
    version = 1,
    identity = "article:1",
    invalidJson = false,
    invalidSearch = false,
  } = {}) {
    const map = new Map();
    const bytes = invalidJson
      ? "{"
      : serialize({
          version: 1,
          key: identity,
          meta: { type: "article" },
          content: { title: "夹具" },
        });
    const dataPath = `articles/1.${sha256(bytes)}.json`;
    const search = serialize({
      version: 1,
      documents: [
        {
          key: invalidSearch ? "unknown" : "article:1",
          type: "article",
          id: 1,
          title: "夹具",
          summary: "夹具",
          content: "夹具",
          tags: [],
        },
      ],
    });
    const searchPath = `search.${sha256(search)}.json`;
    const manifest = serialize({
      version,
      site: { title: "夹具", fields: {}, basePath: "/" },
      items: [
        {
          key: "article:1",
          type: "article",
          id: 1,
          title: "夹具",
          data: dataPath,
          integrity: sha256(bytes),
        },
      ],
      search: { data: searchPath, integrity: sha256(search) },
    });
    const manifestUrl = `https://fixture.invalid/data/site.${sha256(manifest)}.json`;
    map.set(manifestUrl, manifest);
    map.set(new URL(dataPath, manifestUrl).href, bytes);
    map.set(new URL(searchPath, manifestUrl).href, search);
    return { manifestUrl, map, dataUrl: new URL(dataPath, manifestUrl).href };
  }

  async function fault(label, options, expected, mutate = () => {}) {
    const fixture = memoryPackage(options);
    mutate(fixture);
    globalThis.fetch = async url =>
      fixture.map.has(String(url))
        ? new Response(fixture.map.get(String(url)))
        : new Response("missing", { status: 404 });
    try {
      const client = createClient({ manifestUrl: fixture.manifestUrl });
      const pending = options.invalidSearch
        ? client.search("夹具")
        : client.readData({ key: "article:1" });
      await assert.rejects(pending, { code: expected });
      cases.push(label);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  await fault("内容身份错误拒绝读取", { identity: "wrong" }, "IDENTITY_MISMATCH");
  await fault("无效 JSON 拒绝读取", { invalidJson: true }, "INVALID_DATA");
  await fault("未来协议版本拒绝读取", { version: 2 }, "PROTOCOL_MISMATCH");
  await fault("不闭合的搜索 key 拒绝返回", { invalidSearch: true }, "INVALID_DATA");
  await fault("数据摘要不匹配拒绝读取", {}, "INTEGRITY_MISMATCH", fixture =>
    fixture.map.set(fixture.dataUrl, "tampered")
  );
  await fault("资源 404 与空数据区分", {}, "RESOURCE_LOAD_FAILED", fixture =>
    fixture.map.delete(fixture.dataUrl)
  );

  const fixture = memoryPackage();
  let fail = true;
  globalThis.fetch = async url =>
    fail ? new Response("retry", { status: 503 }) : new Response(fixture.map.get(String(url)));
  try {
    const client = createClient({ manifestUrl: fixture.manifestUrl });
    await assert.rejects(client.readData({ key: "article:1" }), { code: "RESOURCE_LOAD_FAILED" });
    fail = false;
    assert.equal((await client.readData({ key: "article:1" })).data.key, "article:1");
    cases.push("初次初始化失败后可重试");
  } finally {
    globalThis.fetch = originalFetch;
  }
  return cases;
}
