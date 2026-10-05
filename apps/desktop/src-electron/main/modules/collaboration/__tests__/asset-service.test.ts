import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ASSET_PREFIX, LOCAL_ASSET_PREFIX } from "@tau/collaboration";
import { CollaborationLocalStore } from "../local-store";
import { CollaborationAssetService } from "../asset-service";

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
