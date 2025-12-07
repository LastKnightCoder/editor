import { getImageInfo } from "@/utils";
import { uploadResource } from "@/hooks/useUploadResource";
import { v4 as getUuid } from "uuid";
import { Board, Operation } from "../types";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
} from "../constants/image";

export class ImageUtil {
  static async insertImage(file: File, board: Board) {
    const info = await getImageInfo(file);
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [];

    let imageWidth = 100;
    let imageHeight = 100;
    if (info && info.width && info.height) {
      imageWidth = info.width;
      imageHeight = info.height;
    }

    const ratio = imageWidth / imageHeight;
    if (imageWidth > 300) {
      imageWidth = 300;
      imageHeight = imageWidth / ratio;
    }

    const imagePath = await uploadResource(file);

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
          description: DEFAULT_DESCRIPTION,
          descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
          descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
          descriptionStyle: {
            fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
          },
        },
      });
    }

    if (ops.length > 0) {
      board.apply(ops);
    }
  }

  private static async getImageSizeFromUrl(
    url: string,
  ): Promise<{ width: number; height: number } | null> {
    if (typeof window === "undefined") return null;
    return new Promise((resolve) => {
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
    const info = await this.getImageSizeFromUrl(src);
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [];
    let imageWidth = 100;
    let imageHeight = 100;
    if (info && info.width && info.height) {
      imageWidth = info.width;
      imageHeight = info.height;
    }

    const ratio = imageWidth / imageHeight;
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
        description: DEFAULT_DESCRIPTION,
        descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
        descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
        descriptionStyle: {
          fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
        },
      },
    });

    board.apply(ops);
  }
}
