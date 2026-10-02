import { act } from "react";
import { createRoot } from "react-dom/client";
import { createEditor } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useContentLocation } from "../ContentEditor/useContentLocation";

const mocks = vi.hoisted(() => ({
  flash: vi.fn(),
  data: null as null | { quote: { exact: string; prefix: string; suffix: string } },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.data, isPending: false }),
}));
vi.mock("@/commands/lineage", () => ({ getLineageAnchor: vi.fn() }));
vi.mock("@/stores/useSettingStore", () => ({
  default: (selector: (state: { setting: { database: { active: string } } }) => unknown) =>
    selector({ setting: { database: { active: "test" } } }),
}));
vi.mock("@/utils/flash-element", () => ({ scrollToAndFlash: mocks.flash }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const editor = createEditor() as ReturnType<EditorRef["getEditor"]>;
editor.children = ["第一块", "第二块观点"].map(text => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
}));
const first = document.createElement("p"),
  second = document.createElement("p");
const Probe = ({ at }: { at: string }) => {
  useContentLocation(editor, 9, at);
  return null;
};
beforeEach(() => {
  vi.useFakeTimers();
  mocks.flash.mockClear();
  mocks.data = null;
  host = document.createElement("div");
  root = createRoot(host);
  vi.spyOn(ReactEditor, "toDOMNode").mockImplementation((_, node) =>
    node === editor.children[0] ? first : second
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const render = async (at: string) => {
  await act(async () => root.render(<Probe at={at} />));
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
};

it("实时块定位、同实例异参重新定位，越界退到首块", async () => {
  await render('{"block":1}');
  expect(mocks.flash).toHaveBeenLastCalledWith(second);
  await render('{"block":999}');
  expect(mocks.flash).toHaveBeenLastCalledWith(first);
  expect(second.hasAttribute("data-content-location")).toBe(false);
});
it("谱系引文在当前正文找回后定位", async () => {
  mocks.data = { quote: { exact: "第二块观点", prefix: "", suffix: "" } };
  await render('{"quote":3}');
  expect(mocks.flash).toHaveBeenLastCalledWith(second);
});
it("丢失锚点和非法参数仍可打开文首", async () => {
  mocks.data = { quote: { exact: "已删除的原文", prefix: "", suffix: "" } };
  await render('{"quote":3}');
  expect(mocks.flash).toHaveBeenLastCalledWith(first);
  await render("broken");
  expect(mocks.flash).toHaveBeenLastCalledWith(first);
});
