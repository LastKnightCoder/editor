import { mediaMenu, browserMediaOptions, type MediaExtensionOptions } from "../extensions/media";
import { Image, Copy, Link, Download, Sparkles, Upload } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { toast } from "@tau/ui";

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
import { DOMSizeMeasurer } from "../extensions/DOMSizeMeasurer";
import ImageElementComponent from "../components/ImageElement";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_DESCRIPTION_POSITION,
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_FONT_SIZE,
} from "../constants/image";
import { BoardUtil, PointUtil, expandSelectionByGroup } from "../utils";

export class ImagePlugin extends CommonPlugin implements IBoardPlugin {
  name = "image";
  private previewStartPoint: { x: number; y: number } | null = null;
  private previewCandidateImage: ImageElement | null = null;
  private previewMoved = false;

  constructor(private readonly media: MediaExtensionOptions = browserMediaOptions) {
    super();
  }

  private resetPreviewState() {
    this.previewStartPoint = null;
    this.previewCandidateImage = null;
    this.previewMoved = false;
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        joins: ["layout"],
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
          return DOMSizeMeasurer.measureMediaHeight(
            image.naturalWidth || image.width || targetWidth,
            image.naturalHeight || image.height || targetWidth * 0.75,
            targetWidth
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
            icon: <Upload size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "image",
                action: "local",
              });
            },
          },
          {
            key: "image-url",
            label: "输入 URL",
            icon: <Link size={14} />,
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "image",
                action: "url",
              });
            },
          },
          {
            key: "image-ai",
            label: "AI 图片生成",
            icon: <Sparkles size={14} />,
            priority: 3,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "image",
                action: "ai",
              });
            },
          },
        ],
        onSelect: () => {},
      });
    }

    // 右键图片元素 → 添加图片操作菜单
    const imageElements = targetElements.filter(el => el.type === "image") as ImageElement[];
    if (imageElements.length === 1) {
      const imageElement = imageElements[0];

      items.push({
        key: "copy-image",
        label: "复制图片",
        icon: <Copy size={14} />,
        priority: 50,
        onSelect: async () => {
          try {
            const response = await fetch(imageElement.src);
            const blob = await response.blob();
            await navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
              }),
            ]);
            toast.success("图片已复制到剪贴板");
          } catch (error) {
            console.error("复制图片失败:", error);
            toast.error("复制图片失败");
          }
        },
      });

      items.push({
        key: "copy-image-link",
        label: "复制链接",
        icon: <Link size={14} />,
        priority: 51,
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(imageElement.src);
            toast.success("链接已复制到剪贴板");
          } catch (error) {
            console.error("复制链接失败:", error);
            toast.error("复制链接失败");
          }
        },
      });

      items.push({
        key: "download-image",
        label: "下载图片",
        icon: <Download size={14} />,
        priority: 52,
        onSelect: async () => {
          try {
            await this.media.download?.(imageElement.src);
            toast.success("图片下载成功");
          } catch (error: any) {
            // 用户取消下载不显示错误
            if (error?.message !== "用户取消了下载") {
              console.error("下载图片失败:", error);
              toast.error("下载图片失败");
            }
          }
        },
      });
    }

    return mediaMenu(items, "image", this.media);
  }

  onPointerDown(e: PointerEvent, board: Board) {
    this.resetPreviewState();

    if (
      e.button !== 0 ||
      board.isCreating() ||
      board.presentationManager.isPresentationMode ||
      board.presentationManager.isCreatingSequence
    ) {
      return;
    }

    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const hitElements = BoardUtil.getHitElements(board, startPoint.x, startPoint.y);
    const clickedElement = hitElements[hitElements.length - 1];
    if (!clickedElement || clickedElement.type !== "image") return;

    const selectedElements = expandSelectionByGroup(board, board.selection.selectedElements);
    const selectedIds = new Set(selectedElements.map(element => element.id));
    if (!selectedIds.has(clickedElement.id)) return;

    this.previewStartPoint = startPoint;
    this.previewCandidateImage = clickedElement as ImageElement;
  }

  onGlobalPointerMove(e: PointerEvent, board: Board) {
    if (!this.previewStartPoint || !this.previewCandidateImage || this.previewMoved) {
      return;
    }

    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!currentPoint) return;

    if (
      Math.hypot(
        currentPoint.x - this.previewStartPoint.x,
        currentPoint.y - this.previewStartPoint.y
      ) > 5
    ) {
      this.previewMoved = true;
    }
  }

  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (!this.previewStartPoint || !this.previewCandidateImage) {
      this.resetPreviewState();
      return;
    }

    const shouldPreview =
      !this.previewMoved && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    const previewImage = this.previewCandidateImage;
    this.resetPreviewState();

    if (!shouldPreview) return;

    board.emit("tau.image.preview-open", {
      src: previewImage.src,
      alt: previewImage.description?.trim() || "图片",
    });
  }

  onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditingElements.length > 0) return;
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
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
      imageFiles.map(file => Promise.all([this.media.imageInfo(file), Promise.resolve(file)]))
    )
      .then(async images => {
        const uploadingToast = toast.loading("正在处理图片，请稍候…");
        try {
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

            const imagePath = await this.media.upload?.(file);
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
          if (ops.length > 0 && canSubmit()) {
            ops.forEach(op => {
              if (op.type === "insert_node") op.path = [board.children.length];
            });
            board.apply(ops);
            toast.success("图片粘贴成功");
          }
        } finally {
          toast.dismiss(uploadingToast);
        }
      })
      .catch(error => {
        console.error("白板媒体粘贴失败", error);
        toast.error("媒体粘贴失败");
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
