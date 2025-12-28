import { Editor, Transforms } from "slate";
import type { Point } from "slate";

/**
 * 中央拖放协调插件
 *
 * 职责：
 * - 提供 editor.handleDrop(files: FileList, point: Point) API
 * - 将文件分类（图片/音频/视频）
 * - 并行调用各扩展注册的处理器
 */
export const withFileDrop = (editor: Editor) => {
  editor.handleDrop = async (files: FileList, point: Point) => {
    // 1. 设置光标到拖放位置
    Transforms.select(editor, point);

    // 2. 按类型分类文件
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    const audioFiles = Array.from(files).filter((f) =>
      f.type.startsWith("audio/"),
    );
    const videoFiles = Array.from(files).filter((f) =>
      f.type.startsWith("video/"),
    );

    // 3. 并行上传所有文件
    const tasks: Promise<void>[] = [];

    if (editor.dropHandlers?.image) {
      imageFiles.forEach((file) =>
        tasks.push(editor.dropHandlers!.image!(file)),
      );
    }

    if (editor.dropHandlers?.audio) {
      audioFiles.forEach((file) =>
        tasks.push(editor.dropHandlers!.audio!(file)),
      );
    }

    if (editor.dropHandlers?.video) {
      videoFiles.forEach((file) =>
        tasks.push(editor.dropHandlers!.video!(file)),
      );
    }

    await Promise.all(tasks);
  };

  return editor;
};
