import { CommonElement } from "../plugins";
import type { StreamOption } from "@/types/youtube";

export interface VideoElement extends CommonElement {
  src: string;
  // 视频的自然宽高，用于在 Column 等容器中保持宽高比
  naturalWidth?: number;
  naturalHeight?: number;
  metaInfo?:
    | {
        type: "local";
        filePath: string;
      }
    | {
        type: "remote";
        url: string;
      }
    | {
        type: "bilibili";
        bvid: string;
        cid: string;
        quality?: number;
      }
    | {
        type: "youtube";
        url: string;
        videoStream: StreamOption;
        audioStream: StreamOption;
      }
    | {
        type: "notion";
        blockId: string;
        cache?: boolean;
      };
}
