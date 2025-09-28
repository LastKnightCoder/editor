import { getVideoInfo } from "@/utils";
import { uploadResource } from "@/hooks/useUploadResource";
import { v4 as getUuid } from "uuid";
import { Board, Operation } from "../types";
import type { VideoElement } from "../types";

export class VideoUtil {
  static async insertVideo(file: File, board: Board) {
    const info = await getVideoInfo(file);
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [];

    let videoWidth = 100;
    let videoHeight = 100;
    if (info && info.width && info.height) {
      videoWidth = info.width;
      videoHeight = info.height;
    }

    const ratio = videoWidth / videoHeight;

    if (videoWidth > 720) {
      videoWidth = 720;
      videoHeight = videoWidth / ratio;
    }

    const videoPath = await uploadResource(file);

    if (videoPath) {
      ops.push({
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "video",
          src: videoPath,
          x: center.x - videoWidth / 2,
          y: center.y - videoHeight / 2,
          width: videoWidth,
          height: videoHeight,
        },
      });
    }

    if (ops.length > 0) {
      board.apply(ops);
    }
  }

  static async insertVideoFromUrl(url: string, board: Board) {
    const { minX, minY, width, height } = board.viewPort;
    const center = { x: minX + width / 2, y: minY + height / 2 };
    const videoWidth = 640;
    const videoHeight = 360;
    const ops: Operation[] = [];
    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "video",
        src: url,
        x: center.x - videoWidth / 2,
        y: center.y - videoHeight / 2,
        width: videoWidth,
        height: videoHeight,
        metaInfo: {
          type: "remote",
          url,
        },
      } as unknown as VideoElement,
    });
    board.apply(ops);
  }

  static async insertVideoFromMeta(
    board: Board,
    meta:
      | { type: "bilibili"; bvid: string; cid: string; quality?: number }
      | {
          type: "youtube";
          videoId: string;
          videoFormat: any;
          audioFormat: any;
        },
  ) {
    const { minX, minY, width, height } = board.viewPort;
    const center = { x: minX + width / 2, y: minY + height / 2 };
    const videoWidth = 640;
    const videoHeight = 360;
    const ops: Operation[] = [];
    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "video",
        src:
          meta.type === "bilibili"
            ? `bilibili://${meta.bvid}`
            : `youtube://${meta.videoId}`,
        x: center.x - videoWidth / 2,
        y: center.y - videoHeight / 2,
        width: videoWidth,
        height: videoHeight,
        metaInfo: meta as any,
      } as unknown as VideoElement,
    });
    board.apply(ops);
  }
}
