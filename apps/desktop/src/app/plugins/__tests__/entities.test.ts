import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginConflictError, type PluginContext } from "@tau/plugins";
import { NotebookPen } from "lucide-react";

const electron = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/electron", () => ({ invoke: electron.invoke, on: vi.fn(), off: vi.fn() }));

import { createDesktopEntities } from "../entities";

const DATABASE = "data.db";
const context = { pluginId: "weekly", signal: new AbortController().signal } as PluginContext;

describe("插件内容适配", () => {
  beforeEach(() => electron.invoke.mockReset());

  it("删除带 revision 交给主进程，冲突转成 PluginConflictError", async () => {
    electron.invoke.mockResolvedValueOnce(undefined);
    const entities = createDesktopEntities(DATABASE);
    await entities.delete(context, "7", "r1");
    expect(electron.invoke).toHaveBeenCalledWith("plugin-entities:delete", {
      databaseName: DATABASE,
      pluginId: "weekly",
      id: 7,
      expectedRevision: "r1",
    });
    electron.invoke.mockRejectedValueOnce(new Error("PLUGIN_CONFLICT:数据已被修改"));
    await expect(entities.delete(context, "7", "r0")).rejects.toBeInstanceOf(PluginConflictError);
    await expect(entities.delete(context, "x", "r0")).rejects.toThrow("内容不存在");
  });

  it("声明类型时把类型名与图标 SVG 随库保存，注销不删除", async () => {
    electron.invoke.mockResolvedValue(true);
    const { registerKind } = createDesktopEntities(DATABASE);
    if (!registerKind) throw new Error("缺少 registerKind");
    const handle = registerKind(context, {
      kind: "note",
      label: "周记",
      icon: NotebookPen,
      open: { page: "review" },
    });
    await vi.waitFor(() => expect(electron.invoke).toHaveBeenCalled());
    const [channel, request] = electron.invoke.mock.calls[0];
    expect(channel).toBe("plugin-entities:declare-kind");
    expect(request).toMatchObject({
      databaseName: DATABASE,
      pluginId: "weekly",
      kind: "note",
      label: "周记",
    });
    expect(request.icon).toMatch(/^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    handle.dispose();
    expect(electron.invoke).toHaveBeenCalledTimes(1);
  });
});
