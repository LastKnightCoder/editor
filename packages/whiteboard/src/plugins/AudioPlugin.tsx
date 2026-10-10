import { mediaMenu, browserMediaOptions, type MediaExtensionOptions } from "../extensions/media";
import { Music2, Link, Download, Upload, Mic } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { toast } from "@tau/ui";

import CommonPlugin from "./CommonPlugin";
import {
  Board,
  IBoardPlugin,
  Operation,
  AudioElement,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
  EHandlerPosition,
  Point,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import AudioElementComponent from "../components/AudioElement";
import { AUDIO_CARD_HEIGHT, AUDIO_DEFAULT_WIDTH } from "../constants/audio";
import { PathUtil } from "../utils";

export class AudioPlugin extends CommonPlugin implements IBoardPlugin {
  name = "audio";

  constructor(private readonly media: MediaExtensionOptions = browserMediaOptions) {
    super();
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        // 58f0660e53ef5165 ColumnFf0851c651654e0e542675315b5065b958f0660e53cd8f6c51b35b9aFf0c89c1 CapabilityService.canContainFf09
        canBeContainedBy: container => container.type === "column",
      },
      movement: { behavior: MovementBehavior.Normal },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "cyan",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        // Audio has fixed height, so always return the constant
        measureHeightForWidth: async () => {
          return AUDIO_CARD_HEIGHT;
        },
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // Right-click on empty area → Add "Audio" menu with submenu
    if (targetElements.length === 0) {
      items.push({
        key: "create-audio",
        label: "音频",
        icon: <Music2 size={14} />,
        priority: 165, // After video (160)
        children: [
          {
            key: "audio-local",
            label: "本地上传",
            icon: <Upload size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "audio",
                action: "local",
              });
            },
          },
          {
            key: "audio-url",
            label: "网络地址",
            icon: <Link size={14} />,
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "audio",
                action: "url",
              });
            },
          },
          {
            key: "audio-tts",
            label: "文本转语音",
            icon: <Mic size={14} />,
            priority: 3,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "audio",
                action: "tts",
              });
            },
          },
        ],
        onSelect: () => {},
      });
    }

    // 右键音频元素 → 添加音频操作菜单
    const audioElements = targetElements.filter(el => el.type === "audio") as AudioElement[];
    if (audioElements.length === 1) {
      const audioElement = audioElements[0];

      items.push({
        key: "copy-audio-link",
        label: "复制链接",
        icon: <Link size={14} />,
        priority: 50,
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(audioElement.src);
            toast.success("链接已复制到剪贴板");
          } catch (error) {
            console.error("复制链接失败:", error);
            toast.error("复制链接失败");
          }
        },
      });

      items.push({
        key: "download-audio",
        label: "下载音频",
        icon: <Download size={14} />,
        priority: 51,
        onSelect: async () => {
          try {
            await this.media.download?.(audioElement.src);
            toast.success("音频下载成功");
          } catch (error: any) {
            // 用户取消下载不显示错误
            if (error?.message !== "用户取消了下载") {
              console.error("下载音频失败:", error);
              toast.error("下载音频失败");
            }
          }
        },
      });
    }

    return mediaMenu(items, "audio", this.media);
  }

  onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditingElements.length > 0) return;
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    const audioFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("audio") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          audioFiles.push(file);
        }
      }
    }

    if (audioFiles.length === 0) return;

    Promise.all(audioFiles.map(file => Promise.resolve(file)))
      .then(async files => {
        const uploadingToast = toast.loading("正在处理音频，请稍候…");

        try {
          let insertPath = board.children.length;
          const { minX, minY, width, height } = board.viewPort;
          const center = {
            x: minX + width / 2,
            y: minY + height / 2,
          };

          const ops: Operation[] = [];
          let offsetY = 0;

          for (const file of files) {
            const audioPath = await this.media.upload?.(file);
            if (audioPath) {
              ops.push({
                type: "insert_node",
                path: [insertPath],
                node: {
                  id: getUuid(),
                  type: "audio",
                  src: audioPath,
                  x: center.x - AUDIO_DEFAULT_WIDTH / 2,
                  y: center.y + offsetY - AUDIO_CARD_HEIGHT / 2,
                  width: AUDIO_DEFAULT_WIDTH,
                  height: AUDIO_CARD_HEIGHT,
                  title: file.name.replace(/\.[^/.]+$/, ""),
                },
              });
              offsetY += AUDIO_CARD_HEIGHT + 20;
            }
            insertPath++;
          }

          if (ops.length > 0 && canSubmit()) {
            ops.forEach(op => {
              if (op.type === "insert_node") op.path = [board.children.length];
            });
            board.apply(ops);
            toast.success("音频粘贴成功");
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

  // Override onResize to keep height constant (only allow horizontal resizing)
  onResize = (
    board: Board,
    element: AudioElement,
    position: EHandlerPosition,
    _startPoint: Point,
    endPoint: Point,
    _isPreserveRatio?: boolean,
    _isAdsorb?: boolean
  ) => {
    // Only handle left and right resize handles
    if (position !== EHandlerPosition.Left && position !== EHandlerPosition.Right) {
      return;
    }

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    let newWidth = element.width;
    let newX = element.x;

    // Calculate new width based on resize handle position
    if (position === EHandlerPosition.Left) {
      const dx = element.x - endPoint.x;
      newWidth = element.width + dx;
      newX = endPoint.x;
    } else if (position === EHandlerPosition.Right) {
      newWidth = endPoint.x - element.x;
    }

    // Clamp width to min/max
    newWidth = Math.max(200, Math.min(600, newWidth));

    // Recalculate x if left handle was used (to keep right edge stable when clamping)
    if (position === EHandlerPosition.Left) {
      newX = element.x + element.width - newWidth;
    }

    board.apply(
      {
        type: "set_node",
        path,
        properties: {
          x: element.x,
          width: element.width,
          height: element.height,
        },
        newProperties: { x: newX, width: newWidth, height: AUDIO_CARD_HEIGHT }, // Always keep height constant
      },
      false
    );
  };

  render(_board: Board, { element }: { element: AudioElement }) {
    return (
      <AudioElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
