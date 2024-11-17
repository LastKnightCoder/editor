import { v4 as getUuid } from 'uuid';
import { message } from 'antd';
import { uploadImage } from '@/hooks/useUploadImage';
import { getVideoInfo } from "@/utils";
import CommonPlugin from "./CommonPlugin";
import { Board, IBoardPlugin, Operation, VideoElement } from "../types";
import VideoElementComponent from "../components/VideoElement";

export class VideoPlugin extends CommonPlugin implements IBoardPlugin {
  name = 'video';

  constructor() {
    super();
  }

   onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditing || board.isEditingProperties) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    const videoFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('video') !== -1) {
        // 获取图片文件
        const file = items[i].getAsFile();
        if (file) {
          videoFiles.push(file)
        }
      }
    }

    if (videoFiles.length === 0) return;

    Promise.all(videoFiles.map(file => Promise.all([
      getVideoInfo(file),
      Promise.resolve(file)
    ]))).then(async videos => {
      message.loading({
        key: 'uploading-video',
        content: '正在处理视频，请稍候...',
        duration: 0
      })
      let insertPath = board.children.length;
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      }
      const ops: Operation[] = [];
      for (const image of videos) {
        const [info, file] = image;

        let width = 100;
        let height = 100;
        if (info && info.width && info.height) {
          width = info.width;
          height = info.height;
        }

        const ratio = width / height;
        if (width > 720) {
          width = 720;
          height = width / ratio;
        }

        const videoPath = await uploadImage(file);
        if (videoPath) {
         ops.push({
          type: 'insert_node',
          path: [insertPath],
          node: {
            id: getUuid(),
            type: 'video',
            src: videoPath,
            x: center.x - width / 2,
            y: center.y - height / 2,
            width,
            height,
          }
         })
        }
        insertPath++;
      }
      if (ops.length > 0) {
        board.apply(ops);
        message.success('视频粘贴成功');
      }
      message.destroy('uploading-video');
    })
  }

  render(_board: Board, { element }: { element: VideoElement }) {
    return (
      <VideoElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    )
  }
}
