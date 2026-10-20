import type { CSSProperties } from "react";
import type { PublishSettings } from "@tau/plugins/publish-data";
import { createEditorKit, defaultExtensions, type EditorKit } from "@tau/editor";
import { previewMenuExtension } from "@tau/editor/source-view/menu";
import webviewExtension from "@tau/editor/extensions/webview";
import { createImageExtensions, type ImageAppearanceConfig } from "@tau/editor/extensions/media";
import {
  IEditorSlots,
  IVideoContentProviders,
  type VideoContentProvider,
} from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { AudioPlayer, VideoPlayer } from "@tau/editor/extensions/media/players";
import { contentLinkExtension } from "./contentLink";
import { projectCardListExtension } from "./projectCardList";

const notice: CSSProperties = {
  border: "1px dashed var(--tau-line-1)",
  borderRadius: "var(--tau-radius-md)",
  padding: 16,
  color: "var(--tau-ink-3)",
};
/** 在线视频依赖桌面端插件取源，发布站点显示说明。 */
const videoProviders: VideoContentProvider[] = [
  {
    id: "online",
    match: element => typeof element.metaInfo?.type === "string",
    Content: () => <div style={notice}>该视频请在桌面端播放</div>,
  },
];

const kits = new Map<string, EditorKit>();

/** 发布内容的完整渲染组合；图片外观取发布设置，同一设置复用同一个 kit。 */
export function publishedKit(settings?: PublishSettings): EditorKit {
  const appearance = (settings?.appearance?.image ?? {}) as ImageAppearanceConfig;
  const key = `${appearance.borderRadius ?? ""}|${String(appearance.shadow ?? "")}`;
  let kit = kits.get(key);
  if (!kit) {
    kit = createEditorKit({
      extensions: [
        ...defaultExtensions,
        previewMenuExtension,
        webviewExtension,
        contentLinkExtension,
        projectCardListExtension,
        ...createImageExtensions({ appearance }),
      ],
      services: [
        register => {
          register(IEditorSlots, {
            ...createDefaultEditorSlots(),
            Video: VideoPlayer,
            Audio: AudioPlayer,
          });
          register(IVideoContentProviders, videoProviders);
        },
      ],
      // 图片扩展按 type 替换默认组合里的同名扩展。
      override: true,
    });
    kits.set(key, kit);
  }
  return kit;
}
