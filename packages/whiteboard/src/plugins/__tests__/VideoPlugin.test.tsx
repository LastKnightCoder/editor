import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { bindWhiteboardI18n } from "../../i18n-runtime";
import { menuLabelReader } from "../../menu-i18n";
import { browserMediaInfo } from "../../extensions/media";
import { expect, it, vi } from "vitest";

vi.mock("../../components/VideoElement", () => ({
  default: () => null,
}));

import { VideoPlugin } from "../VideoPlugin";
import type { ContextMenuContext } from "../../types";

const createContext = (): ContextMenuContext => ({
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: [],
  hitElements: [],
  targetElements: [],
  isHitSelected: false,
  board: { emit: vi.fn() } as unknown as ContextMenuContext["board"],
});

it("宿主提供的每个视频来源各占一个添加入口，名称与动作随来源变化", () => {
  let sources = [
    { id: "bilibili", label: "Bilibili" },
    { id: "my.nas", label: "我的 NAS" },
  ];
  const plugin = new VideoPlugin({
    ...browserMediaInfo,
    actions: ["video-local", "video-url"],
    videoSources: () => sources,
  });
  const context = createContext();
  const menu = plugin.getContextMenu(context).find(item => item.key === "create-video")!;
  expect(menu.children!.map(item => item.label)).toEqual([
    "本地上传",
    "网络地址",
    "Bilibili",
    "我的 NAS",
  ]);
  menu.children![3].onSelect?.(context);
  expect(context.board.emit).toHaveBeenCalledWith("tau.modal.open", {
    type: "video",
    action: "source:my.nas",
  });

  sources = [];
  const next = plugin.getContextMenu(createContext()).find(item => item.key === "create-video")!;
  expect(next.children!.map(item => item.label)).toEqual(["本地上传", "网络地址"]);
});

it("第三方来源与内置文案同名时仍原样展示，换语不重读来源或重发动作", () => {
  const localeSource = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource });
  let reads = 0;
  const plugin = new VideoPlugin({
    ...browserMediaInfo,
    videoSources: () => {
      reads++;
      return [{ id: "author.source", label: "网络地址" }];
    },
  });
  const context = createContext();
  bindWhiteboardI18n(context.board, runtime);
  const action = plugin
    .getContextMenu(context)
    .find(item => item.key === "create-video")
    ?.children?.find(item => item.key === "video-source:author.source");
  if (!action) throw new Error("第三方视频来源未生成");
  const label = menuLabelReader(context.board, action);
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      localeSource.setLocale(locale);
      expect(label()).toBe("网络地址");
      expect(reads).toBe(1);
      expect(context.board.emit).not.toHaveBeenCalled();
    }
    action.onSelect(context);
    expect(context.board.emit).toHaveBeenCalledExactlyOnceWith("tau.modal.open", {
      type: "video",
      action: "source:author.source",
    });
  } finally {
    runtime.dispose();
  }
});
