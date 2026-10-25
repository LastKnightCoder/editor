import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 隔离 Electron 运行时，使用临时目录验证协作缓存和本地副本。
vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => join(tmpdir(), `tau-desktop-test-${name}`),
    isReady: () => true,
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (buffer: Buffer) => buffer.toString("utf8"),
  },
  Notification: class {
    static isSupported() {
      return false;
    }
    show() {}
    close() {}
  },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: () => {} },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { push: () => {}, remove: () => {}, destroy: () => {} },
}));

import { planClosedReshare } from "../content-repository";
import { type CollaborationSession } from "@tau/collaboration";
import { CollaborationLocalStore } from "../local-store";
import { CollaborationAssetService } from "../asset-service";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const temporary = () => {
  const dir = mkdtempSync(join(tmpdir(), "tau-content-test-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

describe("通用内容和本地恢复", () => {
  it("本地缓存带版本，离线增量跨重启恢复，未知新版本不覆盖", () => {
    const directory = temporary();
    const store = new CollaborationLocalStore(directory);
    const doc = createSharedDocument({
      title: "初始",
      content: [{ text: "内容" }],
      bannerBg: "",
      bannerPosition: "center",
    });
    const session: CollaborationSession = {
      id: "offline",
      title: "初始",
      ownerId: "owner",
      role: "owner",
      status: "active",
      members: [],
      updatedAt: 1,
      serverUrl: "https://collab.example",
      connection: "offline",
      pending: true,
      leaving: false,
    };
    store.create(session, doc);
    doc.on("update", update => store.append(session.id, update));
    doc.getText("title").insert(0, "离线");
    store.db.close();
    doc.destroy();
    const restored = new CollaborationLocalStore(directory);
    const loaded = restored.load(session.id);
    expect(loaded.doc.getText("title").toString()).toBe("离线初始");
    loaded.doc.destroy();
    restored.db.pragma("user_version=4");
    restored.db.close();
    expect(() => new CollaborationLocalStore(directory)).toThrow("升级 Tau");
  });

  it("另存资源移动到独立资源目录，删除会话缓存后副本仍可读取", async () => {
    const directory = temporary(),
      cache = join(directory, "collaboration");
    const store = new CollaborationLocalStore(cache);
    cleanup.push(() => store.db.close());
    const assetId = "00000000-0000-4000-8000-000000000001",
      documentId = "session";
    const folder = join(cache, "assets", documentId);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "image.png");
    writeFileSync(file, "PNG-FIXTURE");
    store.db
      .prepare("INSERT INTO resources VALUES (?,?,?,?,?,1)")
      .run(assetId, documentId, "image.png", "image/png", file);
    const assets = new CollaborationAssetService(store, directory, async () => {
      throw new Error("缓存资源不应请求网络");
    });
    const value = await assets.localize(
      "https://collab.example",
      documentId,
      {
        title: "副本",
        bannerBg: "",
        bannerPosition: "center",
        content: [{ type: "image", url: `tau-collab-asset:${assetId}`, children: [{ text: "" }] }],
      },
      BUILTIN_CONTENT_RESOURCES
    );
    store.remove(documentId);
    rmSync(folder, { recursive: true, force: true });
    const localPath = value.content[0].url as string;
    expect(existsSync(localPath)).toBe(true);
    expect(readFileSync(localPath, "utf8")).toBe("PNG-FIXTURE");
    expect(localPath).toContain(join("resources", "collaboration"));
  });
});

describe("结束共享残留的重新发起判定", () => {
  it("closed 且无未同步改动：先写回并拆除残留，再重建共享", () => {
    expect(planClosedReshare({ status: "closed", pending: false })).toEqual({
      action: "rebuild",
    });
  });
  it("closed 且有未同步改动：拒绝并引导到协作页清理，不静默丢弃", () => {
    const plan = planClosedReshare({ status: "closed", pending: true });
    expect(plan?.action).toBe("reject");
    if (plan?.action === "reject") expect(plan.reason).toContain("清理");
  });
  it("活跃 / 退出中的会话不参与判定（退出中由 refresh 重试自愈）", () => {
    expect(planClosedReshare({ status: "active", pending: false })).toBeNull();
    expect(planClosedReshare({ status: "active", pending: true })).toBeNull();
  });
});
