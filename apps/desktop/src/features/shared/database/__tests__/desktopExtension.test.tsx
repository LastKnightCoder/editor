import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Database } from "@tau/database";
import { desktopDatabaseExtension } from "../desktopExtension";

// 桌面端重依赖（编辑器、上传、RPC）不参与扩展装配断言，替换为最小模块
vi.mock("../RowDetailBody", () => ({ RowDetailBody: () => null }));
vi.mock("../GalleryCover", () => ({ GalleryCover: () => null }));
vi.mock("../useFormulaAssist", () => ({ useFormulaAssist: () => undefined }));
vi.mock("../plugins/ImagePlugin", () => ({ default: { type: "image" } }));
vi.mock("../plugins/AttachmentPlugin", () => ({ default: { type: "attachment" } }));
vi.mock("../plugins/RichTextPlugin", () => ({ default: { type: "rich-text" } }));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("@/commands", () => ({ openExternal: vi.fn() }));
vi.mock("@/services/page-navigation", () => ({ openPage: vi.fn() }));

let root: Root | undefined;
let host: HTMLDivElement;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
beforeEach(() => {
  // jsdom 无布局：滚动容器 offsetHeight 为 0 会让行虚拟化一个都不渲染
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
});
afterEach(async () => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight!);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth!);
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const columns = [
  { id: "title", title: "名称", type: "text", width: 160, isPrimary: true },
  { id: "site", title: "网站", type: "link", width: 220 },
];
const viewConfig = { columnOrder: ["title", "site"], rowOrder: ["r1"], sorts: [], filters: null };
const views = [{ id: 1, name: "表格", type: "table" as const, order: 0, config: viewConfig }];

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      <DndProvider backend={HTML5Backend}>
        <Database
          columns={columns}
          data={[{ id: "r1", title: "一行", site: "example.com" }]}
          views={views}
          activeViewId={1}
          viewConfig={viewConfig}
          extensions={[desktopDatabaseExtension]}
          theme="light"
        />
      </DndProvider>
    );
  });
};
it("link 列渲染桌面端 LinkRenderer，内置定义经浅合并保留", async () => {
  await mount();
  // 桌面端 Renderer：值是纯文本 span + 两个操作图标，不是内置的 <a href>
  expect(host.querySelector("a[href]")).toBeNull();
  expect(host.textContent).toContain("example.com");
  const label = Array.from(host.querySelectorAll("span")).find(
    node => node.textContent === "example.com"
  );
  expect(label).toBeTruthy();
  const rendererRoot = label!.parentElement!.parentElement!;
  expect(rendererRoot.querySelectorAll(".lucide-external-link")).toHaveLength(1);
  expect(rendererRoot.querySelectorAll(".lucide-panel-right")).toHaveLength(1);
  // 内置 editable/Editor 未被 fieldOverrides 整包覆盖：双击进入内置 LinkEditor
  await act(async () => {
    label!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  expect(host.querySelector("[contenteditable]")).not.toBeNull();
});
