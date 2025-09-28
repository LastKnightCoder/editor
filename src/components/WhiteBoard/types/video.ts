import { CommonElement } from "../plugins";
import ytdl from "@distube/ytdl-core";

export interface VideoElement extends CommonElement {
  src: string;
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
        videoId: string;
        videoFormat: ytdl.videoFormat;
        audioFormat: ytdl.videoFormat;
      };
}
