import { afterEach, expect, it, vi } from "vitest";

const outlineKey = "tau-whiteboard-outline";
const shelfKey = "tau-whiteboard-shelf";

async function reopen() {
  vi.resetModules();
  return (await import("../dockStore")).useWhiteboardDockStore.getState();
}

afterEach(() => {
  localStorage.removeItem(outlineKey);
  localStorage.removeItem(shelfKey);
});

it("旧版两个面板都打开时恢复元素树，切换素材架并调宽后，重启仍记住各自宽度", async () => {
  localStorage.setItem(
    outlineKey,
    JSON.stringify({ version: 1, state: { open: true, width: 315 } })
  );
  localStorage.setItem(shelfKey, JSON.stringify({ version: 1, state: { open: true } }));

  const dock = await reopen();
  expect(dock.panel).toBe("outline");
  dock.toggle("shelf");
  dock.setWidth("shelf", 368);
  expect(await reopen()).toMatchObject({
    panel: "shelf",
    widths: { outline: 315, shelf: 368 },
  });
});

it("只有旧素材架开关时恢复素材架，主动收起后再启动保持收起", async () => {
  localStorage.setItem(shelfKey, JSON.stringify({ version: 1, state: { open: true } }));
  const dock = await reopen();
  expect(dock.panel).toBe("shelf");
  dock.toggle("shelf");
  expect((await reopen()).panel).toBeNull();
});
