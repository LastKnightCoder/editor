import { expect, it } from "vitest";
import { VIDEO_PLUGIN_MENU_PREFIX, buildAddMenuItems } from "../menuItems";

const videoMenu = (providers: { id: string; name: string }[]) =>
  buildAddMenuItems(providers).find(item => item.key === "add-video-note-project-item")!;

it("「添加视频」下每个启用的视频来源一项，名称取插件名，没有来源时只保留本地与远程", () => {
  expect(
    videoMenu([
      { id: "bilibili", name: "Bilibili" },
      { id: "my.nas", name: "我的 NAS" },
    ]).children
  ).toEqual([
    { key: "add-local-video-note-project-item", label: "本地视频" },
    { key: "add-remote-video-note-project-item", label: "远程视频" },
    { key: `${VIDEO_PLUGIN_MENU_PREFIX}bilibili`, label: "Bilibili" },
    { key: `${VIDEO_PLUGIN_MENU_PREFIX}my.nas`, label: "我的 NAS" },
  ]);
  expect(videoMenu([]).children?.map(item => item.label)).toEqual(["本地视频", "远程视频"]);
});
