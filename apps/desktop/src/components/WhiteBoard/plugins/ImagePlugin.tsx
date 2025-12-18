import { Image } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { message } from "antd";
import { uploadResource } from "@/hooks/useUploadResource";
import { getImageInfo } from "@/utils";
import CommonPlugin from "./CommonPlugin";
import {
  Board,
  IBoardPlugin,
  ImageElement,
  Operation,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import { DOMHeightMeasurer } from "../services/DOMHeightMeasurer";
import ImageElementComponent from "../components/ImageElement";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
} from "../constants/image";

export class ImagePlugin extends CommonPlugin implements IBoardPlugin {
  name = "image";

  constructor() {
    super();
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
      },
      movement: { behavior: MovementBehavior.Normal },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "pink",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (element, targetWidth) => {
          const image = element as ImageElement;
          return DOMHeightMeasurer.measureMediaHeight(
            image.naturalWidth || image.width || targetWidth,
            image.naturalHeight || image.height || targetWidth * 0.75,
            targetWidth,
          );
        },
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「图片」菜单（带二级子菜单）
    if (targetElements.length === 0) {
      items.push({
        key: "create-image",
        label: "图片",
        icon: <Image size={14} />,
        priority: 150,
        children: [
          {
            key: "image-local",
            label: "本地上传",
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "image",
                action: "local",
              });
            },
          },
          {
            key: "image-resource",
            label: "资源库",
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "image",
                action: "resource",
              });
            },
          },
        ],
        onSelect: () => {},
      });
    }

    return items;
  }

  onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditingElements.length > 0) return;
    // 如果粘贴的是图片
    // 检查剪贴板中是否包含图片
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        // 获取图片文件
        const file = items[i].getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;

    Promise.all(
      imageFiles.map((file) =>
        Promise.all([getImageInfo(file), Promise.resolve(file)]),
      ),
    ).then(async (images) => {
      message.loading({
        key: "uploading-image",
        content: "正在处理图片，请稍候...",
        duration: 0,
      });
      let insertPath = board.children.length;
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const ops: Operation[] = [];
      for (const image of images) {
        const [info, file] = image;

        let naturalWidth = 100;
        let naturalHeight = 100;
        if (info && info.width && info.height) {
          naturalWidth = info.width;
          naturalHeight = info.height;
        }

        // 计算显示尺寸，保持宽高比
        let width = naturalWidth;
        let height = naturalHeight;
        const ratio = naturalWidth / naturalHeight;
        if (width > 300) {
          width = 300;
          height = width / ratio;
        }

        const imagePath = await uploadResource(file);
        if (imagePath) {
          ops.push({
            type: "insert_node",
            path: [insertPath],
            node: {
              id: getUuid(),
              type: "image",
              src: imagePath,
              x: center.x - width / 2,
              y: center.y - height / 2,
              width,
              height,
              naturalWidth,
              naturalHeight,
              description: DEFAULT_DESCRIPTION,
              descriptionPosition: DEFAULT_DESCRIPTION_POSITION,
              descriptionAlignment: DEFAULT_DESCRIPTION_ALIGNMENT,
              descriptionStyle: {
                fontSize: DEFAULT_DESCRIPTION_FONT_SIZE,
              },
            },
          });
        }
        insertPath++;
      }
      if (ops.length > 0) {
        board.apply(ops);
        message.success("图片粘贴成功");
      }
      message.destroy("uploading-image");
    });
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
    );
  }
}
