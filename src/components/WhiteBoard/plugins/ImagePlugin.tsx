import { v4 as getUuid } from 'uuid';
import { message } from 'antd';
import { uploadImage } from '@/hooks/useUploadImage';
import { getImageInfo } from "@/utils";
import CommonPlugin from "./CommonPlugin";
import { Board, IBoardPlugin, ImageElement, Operation } from "../types";
import ImageElementComponent from "../components/ImageElement";

export class ImagePlugin extends CommonPlugin implements IBoardPlugin {
  name = 'image';

  constructor() {
    super();
  }

   onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditing || board.isEditingProperties) return;
    // 如果粘贴的是图片
    // 检查剪贴板中是否包含图片
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        // 获取图片文件
        const file = items[i].getAsFile();
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length === 0) return;

    Promise.all(imageFiles.map(file => Promise.all([
      getImageInfo(file),
      Promise.resolve(file)
    ]))).then(async images => {
      message.loading({
        key: 'uploading-image',
        content: '正在处理图片，请稍候...',
        duration: 0
      })
      let insertPath = board.children.length;
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      }
      const ops: Operation[] = [];
      for (const image of images) {
        const [info, file] = image;
        
        let width = 100;
        let height = 100;
        if (info && info.width && info.height) {
          width = info.width;
          height = info.height;
        }

        const ratio = width / height;
        if (width > 300) {
          width = 300;
          height = width / ratio;
        }

        const imagePath = await uploadImage(file);
        if (imagePath) {
         ops.push({
          type: 'insert_node',
          path: [insertPath],
          node: {
            id: getUuid(),
            type: 'image',
            src: imagePath,
            x: center.x - width / 2,
            y: center.y - height / 2,
            width,
            height,
            preserveAspectRatio: 'xMidYMid slice',
          }
         })
        }
        insertPath++;
      }
      if (ops.length > 0) {
        board.apply(ops);
        message.success('图片粘贴成功');
      }
      message.destroy('uploading-image');
    })
  }

  render(_board: Board, { element }: { element: ImageElement }) {
    return (
      <ImageElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    )
  }
}