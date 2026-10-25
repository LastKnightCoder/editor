import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension } from "@tau/editor/api";

import { type AudioElement } from "../../types/index";
import Audio from "./components/Audio/index";
import { audioIngestSpec } from "./ingest";
import blockPanelItems from "./block-panel-items/index";

const audioExtension = defineExtension({
  id: "tau.audio",
  elements: [
    defineElement<AudioElement>({
      type: "audio",
      dataVersion: 1,
      resources: BUILTIN_CONTENT_RESOURCES["audio"],
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
