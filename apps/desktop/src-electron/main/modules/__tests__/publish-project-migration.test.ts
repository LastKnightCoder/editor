import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const provider = vi.hoisted(() => ({ uploadFile: vi.fn(), deleteFile: vi.fn() }));
const git = vi.hoisted(() => ({
  raw: vi.fn(),
  fetch: vi.fn(),
  add: vi.fn(),
  addConfig: vi.fn(),
  status: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
}));
vi.mock("simple-git", () => ({ default: () => git }));
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp", getVersion: () => "test" },
}));
vi.mock("../database", () => ({ default: {} }));
vi.mock("../tables/card", () => ({ default: {} }));
vi.mock("../tables/article", () => ({ default: {} }));
vi.mock("../tables/project", () => ({ default: {} }));
vi.mock("../tables/question", () => ({ default: {} }));
vi.mock("../tables/question-group", () => ({ default: {} }));
vi.mock("../tailwind-runtime", () => ({ default: {} }));
vi.mock("../publish-template-manager", () => ({ default: {} }));
vi.mock("../publish-providers", () => ({
  createPublishProvider: () => provider,
  DEFAULT_UPLOAD_OPTIONS: { concurrency: 1, maxRetries: 1, retryDelay: 0 },
}));
import publisher from "../publish";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("项目迁移后的发布边界", () => {
  it("实际生成文件不含 RSS，旧 RSS 进入删除计划，页面保留站点地址与搜索", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tau-publish-"));
    const db = new Database(":memory:");
    const previous = (publisher as any).templateDir;
    try {
      db.exec(schema);
      db.prepare(
        "INSERT INTO publish_history(file_path,content_hash,publish_time) VALUES('rss.xml','old',1)"
      ).run();
      mkdirSync(join(dir, "src/templates/home"), { recursive: true });
      writeFileSync(
        join(dir, "src/templates/home/index.html"),
        '<html><head></head><body><script>window.data="__DATA_PLACEHOLDER__"</script></body></html>'
      );
      (publisher as any).templateDir = dir;
      vi.spyOn(publisher as any, "ensureTemplateReady").mockResolvedValue(dir);
      const plan = await publisher.buildPublishPlan(db, {
        title: "站点",
        description: "",
        basePath: "/",
        publicUrl: "https://example.test",
      });
      expect(plan.toDelete).toEqual(["rss.xml"]);
      expect(plan.toUpload.map(file => file.path)).toEqual(["index.html", "search-index.json"]);
      const html = plan.toUpload.find(file => file.path === "index.html")!.content.toString();
      expect(html).not.toMatch(/rss|application\/rss\+xml/);
      expect(html).toContain("https://example.test");
      expect(html).toContain("search-index.json");
    } finally {
      (publisher as any).templateDir = previous;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("远端删除失败保留 RSS 历史，正常发布重试成功才移除", async () => {
    const db = new Database(":memory:");
    try {
      db.exec(schema);
      db.prepare(
        "INSERT INTO publish_history(file_path,content_hash,publish_time) VALUES('rss.xml','old',1)"
      ).run();
      vi.spyOn(publisher, "buildPublishPlan").mockResolvedValue({
        toUpload: [],
        toDelete: ["rss.xml"],
        unchanged: [],
      });
      vi.spyOn(publisher as any, "emitProgress").mockImplementation(() => {});
      provider.deleteFile.mockRejectedValueOnce(new Error("删除失败")).mockResolvedValue(undefined);
      const config = { providerType: "s3", providerConfig: {} } as any;
      const site = { title: "站点", description: "", basePath: "/" };
      expect((await publisher.executePublish(db, config, site)).success).toBe(false);
      expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
        { file_path: "rss.xml" },
      ]);
      expect((await publisher.executePublish(db, config, site)).success).toBe(true);
      expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("Git 推送失败后无新改动仍重试推送，成功才清理 RSS 历史", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tau-publish-git-"));
    const workingDir = join(dir, "test_site");
    const db = new Database(":memory:");
    try {
      db.exec(schema);
      db.prepare(
        "INSERT INTO publish_history(file_path,content_hash,publish_time) VALUES('rss.xml','old',1)"
      ).run();
      mkdirSync(workingDir);
      writeFileSync(join(workingDir, "rss.xml"), "旧订阅");
      vi.spyOn(publisher as any, "prepareGitRepository").mockResolvedValue(undefined);
      vi.spyOn(publisher as any, "checkoutTargetBranch").mockResolvedValue(undefined);
      vi.spyOn(publisher as any, "emitProgress").mockImplementation(() => {});
      git.status
        .mockResolvedValueOnce({ files: [{}], staged: ["rss.xml"] })
        .mockResolvedValue({ files: [], staged: [] });
      git.push.mockRejectedValueOnce(new Error("推送失败")).mockResolvedValue(undefined);
      const config = {
        providerType: "github",
        providerConfig: { repo: "test/site", token: "test", branch: "main", gitWorkingDir: dir },
        siteConfig: { title: "测试" },
      };
      const plan = {
        toUpload: [{ path: "index.html", content: "站点", hash: "new" }],
        toDelete: ["rss.xml"],
        unchanged: [],
      };
      await expect((publisher as any).executeGitCliPublish(db, config, plan)).rejects.toThrow(
        "推送失败"
      );
      expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
        { file_path: "rss.xml" },
      ]);
      expect(existsSync(join(workingDir, "rss.xml"))).toBe(false);
      await (publisher as any).executeGitCliPublish(db, config, plan);
      expect(git.push).toHaveBeenCalledTimes(2);
      expect(git.commit).toHaveBeenCalledTimes(1);
      expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
        { file_path: "index.html" },
      ]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("部分选择只公开被选节点的正文，祖先仅保留目录结构", () => {
    const tree = [
      {
        id: 1,
        title: "父目录",
        hasContent: true,
        content: ["私有正文"],
        children: [{ id: 2, hasContent: true, content: ["公开正文"], children: [] }],
      },
    ];
    const filtered = (publisher as any).filterDocTreeNodes(tree, {
      mode: "partial",
      nodes: new Set([2]),
    });
    expect(filtered[0]).toMatchObject({ id: 1, hasContent: false, content: [] });
    expect(filtered[0].children[0].content).toEqual(["公开正文"]);
    expect(tree[0].content).toEqual(["私有正文"]);
  });

  it.each(['{"mode":"partial","nodes":[]}', "broken", '{"unexpected":true}'])(
    "范围 %s 不降级为全选",
    raw => {
      const scope = (publisher as any).parseEntityScopeConfig({ parentPath: raw });
      expect(scope).toEqual({ mode: "partial", nodes: new Set() });
    }
  );

  it.each(["docs/document/1/2.html", "rss.xml"])(
    "上传失败保留旧产物 %s 与历史，重试成功后才删除",
    async retiredPath => {
      const db = new Database(":memory:");
      try {
        db.exec(schema);
        db.prepare(
          "INSERT INTO publish_history(file_path,content_hash,publish_time) VALUES(?, 'old',1)"
        ).run(retiredPath);
        vi.spyOn(publisher, "buildPublishPlan").mockResolvedValue({
          toUpload: [
            {
              path: "docs/project/9/6.html",
              content: "正文",
              hash: "new",
              sourceType: "project",
              sourceId: 9,
            },
          ],
          toDelete: [retiredPath],
          unchanged: [],
        });
        vi.spyOn(publisher as any, "emitProgress").mockImplementation(() => {});
        provider.uploadFile.mockRejectedValueOnce(new Error("断网"));
        provider.deleteFile.mockResolvedValue(undefined);
        const config = { providerType: "s3", providerConfig: {} } as any;
        const site = { title: "站点", description: "", basePath: "/" };
        const failed = await publisher.executePublish(db, config, site);
        expect(failed.success).toBe(false);
        expect(provider.deleteFile).not.toHaveBeenCalled();
        expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
          { file_path: retiredPath },
        ]);
        provider.uploadFile.mockResolvedValue(undefined);
        const success = await publisher.executePublish(db, config, site);
        expect(success.success).toBe(true);
        expect(provider.deleteFile).toHaveBeenCalledWith(retiredPath);
        expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
          { file_path: "docs/project/9/6.html" },
        ]);
      } finally {
        db.close();
      }
    }
  );
});
