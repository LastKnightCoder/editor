import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension } from "@tau/editor/api";

import { type VideoElement } from "../../types/index";
import VideoComponent from "./components/VideoComponent/index";
import { videoIngestSpec } from "./ingest";
import blockPanelItems from "./block-panel-items/index";
import { videoCommands, videoMenuItems } from "./utils/menu";

const videoExtension = defineExtension({
  id: "tau.video",
  elements: [
    defineElement<VideoElement>({
      type: "video",
      resources: BUILTIN_CONTENT_RESOURCES["video"],
      kind: "block",
      isVoid: true,
      render: VideoComponent,
      drag: true,
      // 拖入 / 粘贴视频文件的认领（01 §5.4 ingest）
      ingest: videoIngestSpec,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: videoCommands,
  menu: videoMenuItems,
});

export default videoExtension;
