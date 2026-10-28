import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { invoke } from "@tauri-apps/api/core";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
} from "@tau/plugins";
import { createMobileData } from "./data";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/pluginContentSession", () => ({
  readPluginSharedContent: vi.fn(),
  writePluginSharedContent: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
async function fixture(permissions: PluginPermission[]) {
  const broker = new PluginPermissionBroker({ read: async () => ({}), write: vi.fn() }, () => true);
  const data = createMobileData(
    "project.db",
    "project-session",
    vi.fn(),
    async (context, permission) => {
      if ((await broker.query(context, permission)) !== "granted")
        throw new PluginPermissionError(permission, "denied");
    }
  );
  const host = new PluginHost({
    workspaceId: "project.db",
    storage: createMemoryStorage(),
    permissions: broker,
    data,
  });
  let context!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "test.project",
      name: "项目测试",
      version: "1",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    }),
    permissions,
  });
  await host.enable("test.project");
  return {
    host,
    broker,
    data,
    context,
    async close() {
      await host.dispose();
      broker.dispose();
      data.dispose();
    },
  };
}
it("项目目录须先授予 projects:read，不能顺带取得正文读权限", async () => {
  vi.mocked(invoke).mockResolvedValue([
    {
      documentId: "3",
      title: "引用",
      revision: "1",
      kind: "document",
      ref: { kind: "card", id: "7" },
      children: [],
    },
  ]);
  const current = await fixture(["projects:read"]);
  try {
    const pending = current.context.data.projects.tree("1");
    await vi.waitFor(() => expect(current.broker.prompts).toHaveLength(1));
    expect(current.broker.prompts[0].permissions).toEqual(["projects:read"]);
    expect(invoke).not.toHaveBeenCalled();
    await current.broker.prompts[0].decide("once");
    expect((await pending)?.[0].ref).toEqual({ kind: "card", id: "7" });
    expect(invoke).toHaveBeenCalledWith(
      "plugin_data_read",
      expect.objectContaining({
        database: "project.db",
        token: "project-session",
        request: { method: "projectTree", projectId: "1" },
      })
    );
    await expect(current.context.data.documents.get("3")).rejects.toMatchObject({
      reason: "undeclared",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    await current.close();
  }
});
it("文档创建与移动仅需 documents:write，使用同一作用域并携带版本", async () => {
  vi.mocked(invoke).mockResolvedValue({ id: "3", revision: "new" });
  const current = await fixture(["documents:write"]);
  try {
    const pending = current.context.data.documents.create({
      projectId: "1",
      parentId: "2",
      title: "笔记",
      tags: ["项目"],
      content: { markdown: "正文" },
    });
    await vi.waitFor(() => expect(current.broker.prompts).toHaveLength(1));
    expect(invoke).not.toHaveBeenCalled();
    await current.broker.prompts[0].decide("once");
    await pending;
    expect(invoke).toHaveBeenCalledWith(
      "plugin_data_write",
      expect.objectContaining({
        database: "project.db",
        token: "project-session",
        request: expect.objectContaining({
          method: "create",
          entity: "document",
          content: expect.objectContaining({
            nodes: expect.any(Array),
            contracts: expect.any(Object),
          }),
        }),
      })
    );
    await current.context.data.documents.move(
      "3",
      { projectId: "1", from: "2", to: null, index: 0 },
      { expectedRevision: "new" }
    );
    expect(invoke).toHaveBeenLastCalledWith(
      "plugin_data_write",
      expect.objectContaining({
        request: {
          method: "move",
          entity: "document",
          id: "3",
          move: { projectId: "1", from: "2", to: null, index: 0 },
          expectedRevision: "new",
        },
      })
    );
    await expect(current.context.data.projects.tree("1")).rejects.toMatchObject({
      reason: "undeclared",
    });
  } finally {
    await current.close();
  }
});
it("项目创建不创建空正文，项目与文档删除权限分别询问", async () => {
  vi.mocked(invoke).mockResolvedValue({ id: "1", revision: "1" });
  const current = await fixture(["projects:write", "projects:delete", "documents:delete"]);
  try {
    const pending = current.context.data.projects.create({ title: "研究" });
    await vi.waitFor(() => expect(current.broker.prompts).toHaveLength(1));
    await current.broker.prompts[0].decide("once");
    await pending;
    expect(invoke).toHaveBeenLastCalledWith(
      "plugin_data_write",
      expect.objectContaining({
        request: { method: "create", entity: "project", input: { title: "研究" } },
      })
    );
    vi.mocked(invoke).mockClear();
    const removal = current.context.data.projects.delete("1", { expectedRevision: "1" });
    await vi.waitFor(() => expect(current.broker.prompts).toHaveLength(1));
    expect(current.broker.prompts[0].permissions).toEqual(["projects:delete"]);
    await current.broker.prompts[0].decide("deny");
    await expect(removal).rejects.toMatchObject({ reason: "denied" });
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    await current.close();
  }
});
const body = {
  owners: ["document"],
  own: false,
  binding: null,
  document: {
    contentId: 9,
    createTime: 1,
    updateTime: 1,
    content: [{ type: "paragraph", children: [{ type: "formatted", text: "原文" }] }],
    count: 2,
    contracts: {},
    revision: "old",
    documentId: "body",
    librarySourceId: "library",
  },
};
it("项目文档正文写入前复验 documents:write，沿用原正文版本与视图刷新", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_data_read"
      ? body
      : { ...body, document: { ...body.document, revision: "written" } }
  );
  const check = vi.fn(async () => undefined);
  const changed = vi.fn();
  const data = createMobileData("project.db", "scope", changed, check);
  const context = {
    pluginId: "test.project",
    signal: new AbortController().signal,
  } as PluginContext;
  try {
    expect(
      await data.editContent(
        context,
        "9:1",
        { op: "replaceAll", content: { markdown: "新内容" } },
        "old"
      )
    ).toEqual({ revision: "written" });
    expect(check).toHaveBeenCalledWith(context, "documents:write");
    expect(invoke).toHaveBeenLastCalledWith(
      "plugin_data_write",
      expect.objectContaining({
        request: expect.objectContaining({ expectedRevision: "old", ref: "9:1" }),
      })
    );
    expect(changed).toHaveBeenCalledOnce();
    check.mockRejectedValueOnce(new PluginPermissionError("documents:write", "denied"));
    vi.mocked(invoke).mockClear();
    await expect(
      data.editContent(context, "9:1", { op: "replaceAll", content: { markdown: "拒绝" } }, "old")
    ).rejects.toMatchObject({ reason: "denied" });
    expect(vi.mocked(invoke).mock.calls.every(([command]) => command === "plugin_data_read")).toBe(
      true
    );
  } finally {
    data.dispose();
  }
});
