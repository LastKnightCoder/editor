import { v4 as getUuid } from "uuid";
import { message } from "antd";
import { uploadResource } from "@/hooks/useUploadResource";
import { getImageInfo, getVideoInfo } from "@/utils";
import {
  Board,
  IBoardPlugin,
  Operation,
  ImageElement,
  VideoElement,
} from "../types";
import { PointUtil } from "../utils";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
} from "../constants/image";

export class FileDragDropPlugin implements IBoardPlugin {
  name = "file-drag-drop";

  // 拖拽进入时阻止默认行为
  onDragEnter(e: DragEvent, _board: Board) {
    e.preventDefault();
    e.stopPropagation();
  }

  // 拖拽经过时允许放置
  onDragOver(e: DragEvent, _board: Board) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  // 拖拽离开时清理
  onDragLeave(e: DragEvent, _board: Board) {
    e.preventDefault();
    e.stopPropagation();
  }

  // 放置文件时处理
  onDrop(e: DragEvent, board: Board) {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // 获取放置位置（屏幕坐标转视口坐标）
    const dropPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!dropPoint) return;

    // 处理所有拖入的文件
    this.handleDroppedFiles(files, board, dropPoint);
  }

  private async handleDroppedFiles(
    files: FileList,
    board: Board,
    dropPoint: { x: number; y: number },
  ) {
    const imageFiles: File[] = [];
    const videoFiles: File[] = [];

    // 分类文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        imageFiles.push(file);
      } else if (file.type.startsWith("video/")) {
        videoFiles.push(file);
      }
    }

    // 处理图片文件
    if (imageFiles.length > 0) {
      await this.handleImageFiles(imageFiles, board, dropPoint);
    }

    // 处理视频文件
    if (videoFiles.length > 0) {
      await this.handleVideoFiles(videoFiles, board, dropPoint);
    }
  }

  private async handleImageFiles(
    imageFiles: File[],
    board: Board,
    dropPoint: { x: number; y: number },
  ) {
    // 获取所有图片信息
    const imageInfos = await Promise.all(
      imageFiles.map((file) =>
        Promise.all([getImageInfo(file), Promise.resolve(file)]),
      ),
    );

    message.loading({
      key: "uploading-image-drag",
      content: "正在处理图片，请稍候...",
      duration: 0,
    });

    const ops: Operation[] = [];
    let offsetY = 0;

    for (const [info, file] of imageInfos) {
      // 上传文件
      const imagePath = await uploadResource(file);
      if (!imagePath) continue;

      let naturalWidth = 100;
      let naturalHeight = 100;
      if (info && info.width && info.height) {
        naturalWidth = info.width;
        naturalHeight = info.height;
      }

      // 计算缩放尺寸（参考 ImagePlugin 的实现）
      let displayWidth = naturalWidth;
      let displayHeight = naturalHeight;
      const ratio = naturalWidth / naturalHeight;

      if (displayWidth > 300) {
        displayWidth = 300;
        displayHeight = displayWidth / ratio;
      }

      // 创建图片元素（在放置点创建，多个文件垂直排列）
      ops.push({
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "image",
          src: imagePath,
          x: dropPoint.x - displayWidth / 2,
          y: dropPoint.y + offsetY - displayHeight / 2,
          width: displayWidth,
          height: displayHeight,
          naturalWidth,
          naturalHeight,
          description: DEFAULT_DESCRIPTION,
          descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
          descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
          descriptionStyle: {
            fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
          },
        } as ImageElement,
      });

      offsetY += displayHeight + 20; // 垂直间距
    }

    if (ops.length > 0) {
      board.apply(ops);
      message.success("图片上传成功");
    }
    message.destroy("uploading-image-drag");
  }

  private async handleVideoFiles(
    videoFiles: File[],
    board: Board,
    dropPoint: { x: number; y: number },
  ) {
    // 获取所有视频信息
    const videoInfos = await Promise.all(
      videoFiles.map((file) =>
        Promise.all([getVideoInfo(file), Promise.resolve(file)]),
      ),
    );

    message.loading({
      key: "uploading-video-drag",
      content: "正在处理视频，请稍候...",
      duration: 0,
    });

    const ops: Operation[] = [];
    let offsetY = 0;

    for (const [info, file] of videoInfos) {
      // 上传文件
      const videoPath = await uploadResource(file);
      if (!videoPath) continue;

      let naturalWidth = 100;
      let naturalHeight = 100;
      if (info && info.width && info.height) {
        naturalWidth = info.width;
        naturalHeight = info.height;
      }

      // 计算缩放尺寸（参考 VideoPlugin 的实现）
      let displayWidth = naturalWidth;
      let displayHeight = naturalHeight;
      const ratio = naturalWidth / naturalHeight;

      if (displayWidth > 720) {
        displayWidth = 720;
        displayHeight = displayWidth / ratio;
      }

      // 创建视频元素
      ops.push({
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "video",
          src: videoPath,
          x: dropPoint.x - displayWidth / 2,
          y: dropPoint.y + offsetY - displayHeight / 2,
          width: displayWidth,
          height: displayHeight,
          naturalWidth,
          naturalHeight,
          metaInfo: {
            type: "local",
          },
        } as VideoElement,
      });

      offsetY += displayHeight + 20; // 垂直间距
    }

    if (ops.length > 0) {
      board.apply(ops);
      message.success("视频上传成功");
    }
    message.destroy("uploading-video-drag");
  }
}
