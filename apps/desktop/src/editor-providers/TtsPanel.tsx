import { AudioLines } from "lucide-react";

import { showMediaNode } from "./mediaModalHost";
import { type MediaInsertSource } from "@tau/editor-media/services";
import TTSGenerateModal from "@/components/TTSGenerateModal";
import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";

/**
 * 音频"文本转语音"插入来源（desktop）：
 * 复用 TTSGenerateModal 生成并试听，确认后上传并作为音频元素插入文档。
 */
export const ttsInsertSource: MediaInsertSource = {
  id: "tts",
  label: "文本转语音",
  icon: AudioLines,
  mediaTypes: ["audio"],
  open: ({ onInsert }) => {
    const close = showMediaNode(
      <TTSGenerateModal
        open
        onCancel={() => close()}
        onConfirm={async (audioBlob, text) => {
          const file = new File([audioBlob], `${Date.now()}.mp3`, { type: "audio/mp3" });
          const url = await uploadResourceCommand(file);
          if (!url) throw new Error("上传音频失败");
          onInsert({
            src: url,
            title: "语音配音",
            attributes: { isFromGenerate: true, audioText: text },
          });
          close();
        }}
      />
    );
  },
};
