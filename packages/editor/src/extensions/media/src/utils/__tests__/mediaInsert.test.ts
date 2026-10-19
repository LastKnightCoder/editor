import { expect, it, vi } from "vitest";
import type { Editor } from "slate";
import type { MediaInsertSource } from "../../services/mediaProviders";
import { getMediaInsertMenuItems } from "../mediaInsert";

const source = (id: string, label: string): MediaInsertSource => ({
  id,
  label,
  mediaTypes: ["video"],
  open: vi.fn(),
});

const editorWith = (value: unknown) => ({ tryGetService: () => value }) as unknown as Editor;

it("插入来源可注册为函数，每次组装菜单时读取最新列表", () => {
  let sources = [source("a", "Bilibili")];
  const editor = editorWith(() => sources);
  const titles = () => getMediaInsertMenuItems(editor, "video").map(item => item.title);
  expect(titles()).toEqual(["本地上传", "网络地址", "Bilibili"]);
  sources = [source("a", "Bilibili"), source("b", "我的 NAS")];
  expect(titles()).toEqual(["本地上传", "网络地址", "Bilibili", "我的 NAS"]);
});

it("静态数组照常可用，并按媒体类型过滤", () => {
  const editor = editorWith([source("a", "Bilibili")]);
  expect(getMediaInsertMenuItems(editor, "image").map(item => item.title)).toEqual([
    "本地上传",
    "网络地址",
  ]);
});
