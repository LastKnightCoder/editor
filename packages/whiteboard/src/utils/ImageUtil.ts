import type { MediaExtensionOptions } from "../extensions/media";
import { v4 as getUuid } from "uuid";
import { Board, Operation } from "../types";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
  DEFAULT_IMAGE_SHADOW_SIZE,
} from "../constants/image";
import { EShadowSize } from "../constants";

const LOCAL_STORAGE_KEY = "whiteboard-image";

export class ImageUtil {
  static setLocalStorage(key: string, value: string | undefined) {
    if (!value) {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}-${key}`);
      return;
    }
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevImageStyle() {
    const shadowSize = (this.getLocalStorage("shadowSize") ||
      DEFAULT_IMAGE_SHADOW_SIZE) as EShadowSize;
    return { shadowSize } as const;
  }

  static async insertImage(file: File, board: Board, media: MediaExtensionOptions) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const info = await media.imageInfo(file);
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
    let imageWidth = naturalWidth;
    let imageHeight = naturalHeight;
    const ratio = naturalWidth / naturalHeight;
    if (imageWidth > 300) {
      imageWidth = 300;
      imageHeight = imageWidth / ratio;
    }

    const imagePath = await media.upload?.(file);

    if (imagePath) {
      ops.push({
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "image",
          src: imagePath,
          x: center.x - imageWidth / 2,
          y: center.y - imageHeight / 2,
          width: imageWidth,
          height: imageHeight,
          naturalWidth,
          naturalHeight,
          description: DEFAULT_DESCRIPTION,
          descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
          descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
          descriptionStyle: {
            fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
          },
          ...this.getPrevImageStyle(),
        },
      });
    }

    if (ops.length > 0) {
      if (!canSubmit()) return;
      board.apply(ops);
    }
  }

  private static async getImageSizeFromUrl(
    url: string
  ): Promise<{ width: number; height: number } | null> {
    if (typeof window === "undefined") return null;
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      try {
        img.crossOrigin = "anonymous";
      } catch {
        // ignore
      }
      img.src = url;
    });
  }

  static async insertImageFromPath(src: string, board: Board) {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const info = await this.getImageSizeFromUrl(src);
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
    let imageWidth = naturalWidth;
    let imageHeight = naturalHeight;
    const ratio = naturalWidth / naturalHeight;
    if (imageWidth > 300) {
      imageWidth = 300;
      imageHeight = imageWidth / ratio;
    }

    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "image",
        src,
        x: center.x - imageWidth / 2,
        y: center.y - imageHeight / 2,
        width: imageWidth,
        height: imageHeight,
        naturalWidth,
        naturalHeight,
        description: DEFAULT_DESCRIPTION,
        descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
        descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
        descriptionStyle: {
          fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
        },
        ...this.getPrevImageStyle(),
      },
    });

    if (!canSubmit()) return;

    board.apply(ops);
  }
}
