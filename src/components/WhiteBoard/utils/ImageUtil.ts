import { getImageInfo } from "@/utils";
import { uploadImage } from "@/hooks/useUploadImage";
import { v4 as getUuid } from "uuid";
import { Board, Operation } from "../types";

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

    const imagePath = await uploadImage(file);

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
        },
      });
    }

    if (ops.length > 0) {
      board.apply(ops);
    }
  }
}
