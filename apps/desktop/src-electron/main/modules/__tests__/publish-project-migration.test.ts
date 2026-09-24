import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

const provider = vi.hoisted(() => ({ uploadFile: vi.fn(), deleteFile: vi.fn() }));
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

afterEach(() => vi.restoreAllMocks());

describe("项目迁移后的发布边界", () => {
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

  it("上传失败保留旧文件与历史，重试成功后才删除", async () => {
    const db = new Database(":memory:");
    try {
      db.exec(schema);
      db.prepare(
        "INSERT INTO publish_history(file_path,content_hash,publish_time) VALUES(?, 'old',1)"
      ).run("docs/document/1/2.html");
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
        toDelete: ["docs/document/1/2.html"],
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
        { file_path: "docs/document/1/2.html" },
      ]);
      provider.uploadFile.mockResolvedValue(undefined);
      const success = await publisher.executePublish(db, config, site);
      expect(success.success).toBe(true);
      expect(provider.deleteFile).toHaveBeenCalledWith("docs/document/1/2.html");
      expect(db.prepare("SELECT file_path FROM publish_history").all()).toEqual([
        { file_path: "docs/project/9/6.html" },
      ]);
    } finally {
      db.close();
    }
  });
});
