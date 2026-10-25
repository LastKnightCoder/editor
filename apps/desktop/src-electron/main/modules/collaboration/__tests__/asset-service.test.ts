import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ASSET_PREFIX, LOCAL_ASSET_PREFIX } from "@tau/collaboration";
import { CollaborationLocalStore } from "../local-store";
import { CollaborationAssetService } from "../asset-service";
import { prepareContentContract } from "@tau/db-schema/content-contracts";

const SERVER = "https://collab.example";
const DOCUMENT = "doc-1";

const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const fn of cleanup.splice(0).reverse()) fn();
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "tau-asset-test-"));
  const appDirectory = join(root, ".editor");
  mkdirSync(appDirectory, { recursive: true });
  const store = new CollaborationLocalStore(join(appDirectory, "collaboration"));
  cleanup.push(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const uploads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const id = String((init.headers as Record<string, string>)["X-Asset-Id"]);
      uploads.push(id);
      return new Response(JSON.stringify({ id }), { status: 200 });
    })
  );
  const assets = new CollaborationAssetService(store, appDirectory, async () => ({
    id: "device",
    secret: "secret",
    nickname: "作者",
  }));
  const file = (name: string, content = "FIXTURE") => {
    const path = join(root, name);
    writeFileSync(path, content);
    return path;
  };
  return { assets, file, uploads, root };
}

describe("发起共享时的资源处理", () => {
  it("内嵌资源在本机转换为可保全文件，上传使用同一资源路径", async () => {
    const { assets } = setup();
    const uri = "data:image/png;base64," + Buffer.from("image-data").toString("base64");
    const definition = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const value = {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "image",
          collabId: "image",
          tauContract: definition.id,
          url: uri,
          children: [{ text: "" }],
        },
      ],
    };
    const prepared = await assets.prepareLocalDocument(DOCUMENT, value, {
      [definition.id]: definition.contract,
    });
    expect(String(prepared.content[0].url).startsWith(LOCAL_ASSET_PREFIX)).toBe(true);
    const path = await assets.resolveReference(SERVER, DOCUMENT, String(prepared.content[0].url));
    expect(readFileSync(path).toString()).toBe("image-data");
    expect(assets.recoveryFiles(DOCUMENT).missing).toEqual([]);
  });
  it("恢复包按声明收集外部附件，重复路径只复制一次，缺失资源明确列出", () => {
    const { assets, file, root } = setup();
    const path = file("attachment.pdf", "附件原文");
    const missing = join(root, "missing.pdf");
    const result = assets.recoveryFiles(DOCUMENT, [path, path, missing, "tau-collab:unknown"]);
    expect(result.files).toEqual([{ name: "resource-0", path }]);
    expect(result.resources).toHaveLength(3);
    expect(result.missing).toEqual([missing, "tau-collab:unknown"]);
    expect(readFileSync(result.files[0].path, "utf8")).toBe("附件原文");
  });
  it("缺失资源诊断保留本地路径，远程凭据和内嵌载荷不进入日志明细", () => {
    const { assets, root } = setup();
    const missing = join(root, "missing.pdf");
    const remote = "https://user:password@example.com/image.png?token=secret#credential";
    const inline = "data:image/png;base64,c2VjcmV0";
    const result = assets.recoveryFiles(DOCUMENT, [missing, remote, inline]);
    expect(result.missing).toEqual([missing, remote, inline]);
    expect(result.missingDetails).toEqual([
      {
        reference: missing,
        original: missing,
        resolvedPath: missing,
        reason: "本地文件不存在或不可访问",
      },
      {
        reference: "https://example.com/image.png",
        original: "https://example.com/image.png",
        resolvedPath: null,
        reason: "引用无法解析为本地文件",
      },
      {
        reference: "data:[已省略载荷]",
        original: "data:[已省略载荷]",
        resolvedPath: null,
        reason: "引用无法解析为本地文件",
      },
    ]);
  });
  it("整库替换保留外部引用，仍收集本地文件并报告真正缺失的附件", () => {
    const { assets, file, root } = setup();
    const local = file("attachment.pdf", "附件原文");
    const missing = join(root, "missing.pdf");
    const external = [
      "https://example.com/image.png",
      "http://example.com/video.mp4",
      "notion://page/unused",
      "data:image/png;base64,aW1hZ2U=",
    ];
    const localServer = "http://localhost:24678/resources/missing.png";
    const result = assets.recoveryFiles(
      DOCUMENT,
      [...external, local, missing, localServer, "tau-collab:unknown"],
      "library-replacement"
    );
    expect(result.files).toEqual([{ name: "resource-0", path: local }]);
    expect(result.missing).toEqual([missing, localServer, "tau-collab:unknown"]);
    for (const reference of external)
      expect(result.resources).toContainEqual({ reference, original: reference });
    expect(assets.recoveryFiles(DOCUMENT, external).missing).toEqual(external);
  });
  it("新文档按每个节点的历史契约映射资源，本机会话不上传文件", async () => {
    const { assets, file, uploads } = setup();
    const first = await prepareContentContract("plugin.example", {
      type: "example",
      dataVersion: 1,
      kind: "block",
      resources: [{ path: "oldCover", kind: "image" }],
    });
    const second = await prepareContentContract("plugin.example", {
      type: "example",
      dataVersion: 2,
      kind: "block",
      resources: [{ path: "cover", kind: "image" }],
    });
    const contracts = { [first.id]: first.contract, [second.id]: second.contract };
    const path = file("cover.png");
    const value = {
      title: "资源",
      bannerBg: "linear-gradient(red,blue)",
      bannerPosition: "center",
      content: [
        {
          type: "example",
          tauContract: first.id,
          oldCover: path,
          cover: "业务字符串",
          children: [{ text: "" }],
        },
        {
          type: "example",
          tauContract: second.id,
          cover: path,
          oldCover: "旧业务字段",
          children: [{ text: "" }],
        },
      ],
    };
    const prepared = await assets.prepareLocalDocument(DOCUMENT, value, contracts);
    expect(prepared.content[0]).toMatchObject({
      oldCover: expect.stringMatching(/^tau-collab-local:/),
      cover: "业务字符串",
    });
    expect(prepared.content[1]).toMatchObject({
      cover: prepared.content[0].oldCover,
      oldCover: "旧业务字段",
    });
    expect(await assets.localizeDocument(SERVER, DOCUMENT, prepared, contracts)).toEqual(value);
    expect(uploads).toEqual([]);
  });
  it("可读取的本地图片上传为服务器资产", async () => {
    const { assets, file, uploads } = setup();
    const shared = await assets.shareReference(SERVER, DOCUMENT, file("a.png"));
    expect(shared.startsWith(ASSET_PREFIX)).toBe(true);
    expect(uploads).toEqual([shared.slice(ASSET_PREFIX.length)]);
  });

  it("远程地址与渐变横幅原样保留", async () => {
    const { assets, uploads } = setup();
    const remote = "https://img.example/a.png";
    expect(await assets.shareReference(SERVER, DOCUMENT, remote)).toBe(remote);
    const gradient = "linear-gradient(90deg, red, blue)";
    expect(await assets.shareReference(SERVER, DOCUMENT, gradient, "bannerBg")).toBe(gradient);
    expect(uploads).toEqual([]);
  });

  it("本地视频、丢失文件与无法识别的路径换成仅本机引用，不上传也不报错", async () => {
    const { assets, file, root, uploads } = setup();
    for (const reference of [file("clip.mp4"), join(root, "missing.png"), "./relative.png"]) {
      const shared = await assets.shareReference(SERVER, DOCUMENT, reference);
      expect(shared).toMatch(/^tau-collab-local:[a-f0-9-]{36}$/);
      expect(shared).not.toContain(root);
    }
    expect(uploads).toEqual([]);
  });

  it("仅本机引用只在记录它的设备上解析，结束共享时还原为原始引用", async () => {
    const { assets, file } = setup();
    const video = file("clip.mp4");
    const shared = await assets.shareReference(SERVER, DOCUMENT, video);
    await expect(assets.resolveReference(SERVER, DOCUMENT, shared)).resolves.toBe(video);
    await expect(
      assets.resolveReference(SERVER, DOCUMENT, `${LOCAL_ASSET_PREFIX}${crypto.randomUUID()}`)
    ).rejects.toThrow("资源仅在分享者本机可用");
    expect(await assets.localizeReference(SERVER, DOCUMENT, shared)).toBe(video);
  });

  it("协作中插入的视频只缓存在本机，结束共享时转存到资源目录", async () => {
    const { assets, uploads } = setup();
    const reference = await assets.keepLocalFile(DOCUMENT, {
      name: "clip.mp4",
      mime: "video/mp4",
      bytes: new TextEncoder().encode("VIDEO"),
    });
    expect(reference.startsWith(LOCAL_ASSET_PREFIX)).toBe(true);
    expect(assets.hasPending(DOCUMENT)).toBe(false);
    const local = await assets.localizeReference(SERVER, DOCUMENT, reference);
    expect(local).toContain(join("resources", "collaboration"));
    expect(existsSync(local) && readFileSync(local, "utf8")).toBe("VIDEO");
    expect(uploads).toEqual([]);
  });

  it("本机没有记录的仅本机引用（其他成员插入）结束共享时原样保留", async () => {
    const { assets } = setup();
    const foreign = `${LOCAL_ASSET_PREFIX}${crypto.randomUUID()}`;
    expect(await assets.localizeReference(SERVER, DOCUMENT, foreign)).toBe(foreign);
  });
});

it("旧 Windows 附件路径跨平台并随资料目录迁移，保全副本和实际文件一致", async () => {
  const { root } = setup();
  const relocated = join(root, "relocated-library");
  mkdirSync(join(relocated, "resources"), { recursive: true });
  const file = join(relocated, "resources", "历史附件.png");
  writeFileSync(file, "原始附件字节");
  const store = new CollaborationLocalStore(join(relocated, "collaboration"));
  cleanup.push(() => store.db.close());
  const assets = new CollaborationAssetService(store, relocated, async () => {
    throw new Error("本机升级不得联网");
  });
  for (const reference of [
    "~\\.editor\\resources\\历史附件.png",
    "~/.editor/resources/历史附件.png",
  ]) {
    expect(assets.recoveryPath(reference)).toBe(file);
    const local = await assets.prepareLocalReference(DOCUMENT, reference);
    expect(assets.recoveryPath(local, DOCUMENT)).toBe(file);
    const recovery = assets.recoveryFiles(DOCUMENT, [reference, local]);
    expect(recovery.missing).toEqual([]);
    expect(recovery.files.length).toBeGreaterThan(0);
    for (const entry of recovery.files)
      expect(readFileSync(entry.path, "utf8")).toBe("原始附件字节");
  }
});
