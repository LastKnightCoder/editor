import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { PluginContext, PluginPermissionState } from "@tau/plugins";
import type { Descendant } from "slate";
import { createMobileData } from "./data";
import { registerContentWriter } from "../../services/contentWriteCoordinator";
import { readPluginSharedContent } from "../../services/pluginContentSession";
import { collaborationManager } from "../../features/collaboration/core/manager";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/pluginContentSession", () => ({
  readPluginSharedContent: vi.fn(),
  writePluginSharedContent: vi.fn(),
}));
vi.mock("../../features/collaboration/core/manager", () => ({
  collaborationManager: { project: vi.fn() },
}));
const nodes: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "原文" }] },
];
const source = {
  owners: ["card"],
  own: false,
  binding: null as string | null,
  document: {
    contentId: 1,
    createTime: 1,
    updateTime: 1,
    count: 2,
    content: nodes,
    contracts: {},
    revision: "r1",
    documentId: "document",
    librarySourceId: "library",
  },
};
function context() {
  const controller = new AbortController();
  return {
    controller,
    query: vi.fn<() => Promise<PluginPermissionState>>(async () => "granted"),
    request: vi.fn(),
  };
}
function scoped(state: ReturnType<typeof context>) {
  return {
    pluginId: "test.component",
    workspaceId: "one.db",
    signal: state.controller.signal,
    permissions: { query: state.query, request: state.request },
  } as unknown as PluginContext;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockReset();
  vi.mocked(readPluginSharedContent).mockReset();
});

it("组件挂载只查询权限，未授权时不加载共享正文或弹窗", async () => {
  const state = context();
  state.query.mockResolvedValue("prompt");
  vi.mocked(invoke).mockResolvedValue({ ...source, binding: "shared" });
  const data = createMobileData("one.db", "token", vi.fn());
  try {
    await expect(data.resolveComponentContent(scoped(state), "1:1", "read")).resolves.toEqual({
      status: "prompt",
      permission: "cards:read",
    });
    expect(state.request).not.toHaveBeenCalled();
    expect(readPluginSharedContent).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    data.dispose();
  }
});

it("共享正文读取途中撤权，不把迟到正文交付组件", async () => {
  const state = context();
  vi.mocked(invoke).mockResolvedValue({ ...source, binding: "shared" });
  let finish!: (value: Awaited<ReturnType<typeof readPluginSharedContent>>) => void;
  vi.mocked(readPluginSharedContent).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const data = createMobileData("one.db", "token", vi.fn());
  try {
    const pending = data.resolveComponentContent(scoped(state), "1:1", "read");
    await vi.waitFor(() => expect(readPluginSharedContent).toHaveBeenCalled());
    state.query.mockResolvedValue("denied");
    finish({ nodes, contracts: {}, revision: "r2" } as Awaited<
      ReturnType<typeof readPluginSharedContent>
    >);
    await expect(pending).resolves.toEqual({ status: "denied" });
  } finally {
    data.dispose();
  }
});

it("组件保存携带固定库和版本，不递归冲洗当前编辑器writer", async () => {
  const state = context();
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_data_write"
      ? { ...source, document: { ...source.document, revision: "r2" } }
      : source
  );
  const flush = vi.fn(async () => {
    throw new Error("不应递归");
  });
  const stop = registerContentWriter("library", "document", { flush, clean: () => false });
  const data = createMobileData("one.db", "token", vi.fn());
  try {
    await expect(
      data.saveComponentContent(scoped(state), "1:1", nodes, {}, "r1")
    ).resolves.toMatchObject({ revision: "r2" });
    expect(flush).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith(
      "plugin_data_write",
      expect.objectContaining({
        database: "one.db",
        token: "token",
        pluginId: "test.component",
        request: expect.objectContaining({ method: "content", ref: "1:1", expectedRevision: "r1" }),
      })
    );
    await expect(
      data.saveComponentContent(scoped(state), "1:1", nodes, {}, "old")
    ).rejects.toMatchObject({ name: "PluginConflictError" });
  } finally {
    stop();
    data.dispose();
  }
});

it("共享投影复验权限并携带插件固定来源", async () => {
  const state = context();
  vi.mocked(invoke).mockResolvedValue({ ...source, binding: "shared" });
  vi.mocked(readPluginSharedContent).mockResolvedValue({
    nodes,
    contracts: {},
    revision: "r1",
  } as Awaited<ReturnType<typeof readPluginSharedContent>>);
  const data = createMobileData("one.db", "token", vi.fn());
  try {
    await data.projectComponentContent(scoped(state), "1:1");
    expect(collaborationManager.project).toHaveBeenCalledWith(
      "shared",
      expect.objectContaining({ database: "one.db", token: "token", pluginId: "test.component" }),
      expect.any(Function)
    );
    state.query.mockResolvedValue("denied");
    await expect(data.projectComponentContent(scoped(state), "1:1")).rejects.toThrow("授权已失效");
    expect(collaborationManager.project).toHaveBeenCalledTimes(1);
  } finally {
    data.dispose();
  }
});

it("视图停用后迟到目标不继续保存或投影", async () => {
  const state = context();
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const data = createMobileData("one.db", "token", vi.fn());
  try {
    const pending = data.projectComponentContent(scoped(state), "1:1");
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    state.controller.abort();
    finish(source);
    await rejected;
    expect(collaborationManager.project).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    data.dispose();
  }
});
