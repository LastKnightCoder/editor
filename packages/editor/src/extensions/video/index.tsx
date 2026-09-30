import { defineElement, defineExtension } from "../../api";

import type { VideoElement } from "../../types";
import VideoComponent from "./components/VideoComponent";
import { videoIngestSpec } from "./ingest";
import blockPanelItems from "./block-panel-items";
import { videoCommands, videoMenuItems } from "./utils/menu";

const videoExtension = defineExtension({
  id: "tau.video",
  elements: [
    defineElement<VideoElement>({
      type: "video",
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
