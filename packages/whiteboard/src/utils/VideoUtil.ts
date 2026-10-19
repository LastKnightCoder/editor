import type { MediaCapabilities } from "../extensions/media";
import { v4 as getUuid } from "uuid";
import { Board, Operation } from "../types";
import type { VideoElement } from "../types";
import type { OnlineVideoMeta } from "../types/video";
export class VideoUtil {
  static async insertVideo(file: File, board: Board, media: MediaCapabilities) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const info = await media.videoInfo(file);
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [];

    let naturalWidth = 100;
    let naturalHeight = 100;
    if (info && info.width && info.height) {
      naturalWidth = info.width;
      naturalHeight = info.height;
    }

    // 计算显示尺寸，保持宽高比
    let videoWidth = naturalWidth;
    let videoHeight = naturalHeight;
    const ratio = naturalWidth / naturalHeight;

    if (videoWidth > 720) {
      videoWidth = 720;
      videoHeight = videoWidth / ratio;
    }

    const videoPath = await media.upload?.(file);

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
          naturalWidth,
          naturalHeight,
        },
      });
    }

    if (ops.length > 0) {
      if (!canSubmit()) return;
      board.apply(ops);
    }
  }

  private static async getVideoSizeFromUrl(
    url: string
  ): Promise<{ width: number; height: number } | null> {
    if (typeof document === "undefined") return null;
    return new Promise(resolve => {
      const video = document.createElement("video");
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => resolve(null);
      video.src = url;
    });
  }

  static async insertVideoFromPath(src: string, board: Board) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const info = await this.getVideoSizeFromUrl(src);
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [];

    let naturalWidth = 640;
    let naturalHeight = 360;
    if (info && info.width && info.height) {
      naturalWidth = info.width;
      naturalHeight = info.height;
    }

    // 计算显示尺寸，保持宽高比
    let videoWidth = naturalWidth;
    let videoHeight = naturalHeight;
    const ratio = naturalWidth / naturalHeight;

    if (videoWidth > 720) {
      videoWidth = 720;
      videoHeight = videoWidth / ratio;
    }

    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "video",
        src,
        x: center.x - videoWidth / 2,
        y: center.y - videoHeight / 2,
        width: videoWidth,
        height: videoHeight,
        naturalWidth,
        naturalHeight,
      },
    });

    if (!canSubmit()) return;

    board.apply(ops);
  }

  static async insertVideoFromUrl(url: string, board: Board) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const { minX, minY, width, height } = board.viewPort;
    const center = { x: minX + width / 2, y: minY + height / 2 };
    // 默认使用 16:9 比例
    const naturalWidth = 1920;
    const naturalHeight = 1080;
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
        naturalWidth,
        naturalHeight,
        metaInfo: {
          type: "remote",
          url,
        },
      } as unknown as VideoElement,
    });
    if (!canSubmit()) return;
    board.apply(ops);
  }

  /** 插入视频插件提供的视频：src 保存原页面地址，播放由宿主按 meta 取源。 */
  static async insertVideoFromMeta(board: Board, meta: OnlineVideoMeta, pageUrl: string) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const { minX, minY, width, height } = board.viewPort;
    const center = { x: minX + width / 2, y: minY + height / 2 };
    // 默认使用 16:9 比例
    const naturalWidth = 1920;
    const naturalHeight = 1080;
    const videoWidth = 640;
    const videoHeight = 360;
    const ops: Operation[] = [];
    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "video",
        src: pageUrl,
        x: center.x - videoWidth / 2,
        y: center.y - videoHeight / 2,
        width: videoWidth,
        height: videoHeight,
        naturalWidth,
        naturalHeight,
        metaInfo: meta,
      } as unknown as VideoElement,
    });
    if (!canSubmit()) return;
    board.apply(ops);
  }
}
