import { defineElement, defineExtension } from "../../api";

import type { AudioElement } from "../../types";
import Audio from "./components/Audio";
import { audioIngestSpec } from "./ingest";
import blockPanelItems from "./block-panel-items";

const audioExtension = defineExtension({
  id: "tau.audio",
  elements: [
    defineElement<AudioElement>({
      type: "audio",
      kind: "block",
      isVoid: true,
      render: Audio,
      drag: true,
      // 拖入 / 粘贴音频文件的认领（01 §5.4 ingest）
      ingest: audioIngestSpec,
    }),
  ],
  blockPanel: blockPanelItems,
});

export default audioExtension;
