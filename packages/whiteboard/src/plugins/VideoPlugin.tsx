import { menuText } from "../menu-i18n";
import { whiteboardFeedback } from "../feedback-i18n";
import { mediaMenu, browserMediaInfo, type MediaCapabilities } from "../extensions/media";
import { Video, Link, Download, Upload, MonitorPlay, FileText } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { toast } from "@tau/ui";

import CommonPlugin from "./CommonPlugin";
import {
  Board,
  IBoardPlugin,
  Operation,
  VideoElement,
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
import VideoElementComponent from "../components/VideoElement";

export class VideoPlugin extends CommonPlugin implements IBoardPlugin {
  name = "video";

  constructor(private readonly media: MediaCapabilities = browserMediaInfo) {
    super();
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
        getColorTheme: () => "rose",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (element, targetWidth) => {
          const video = element as VideoElement;
          return DOMSizeMeasurer.measureMediaHeight(
            video.naturalWidth || video.width || targetWidth,
            video.naturalHeight || video.height || targetWidth * 0.5625, // 16:9
            targetWidth
          );
        },
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「视频」菜单（带二级子菜单）
    if (targetElements.length === 0) {
      items.push({
        key: "create-video",
        ...menuText(context.board, "menus.media.video"),
        icon: <Video size={14} />,
        priority: 160,
        children: [
          {
            key: "video-local",
            ...menuText(context.board, "menus.media.local"),
            icon: <Upload size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "video",
                action: "local",
              });
            },
          },
          {
            key: "video-url",
            ...menuText(context.board, "menus.media.address"),
            icon: <Link size={14} />,
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "video",
                action: "url",
              });
            },
          },
          ...(this.media.videoSources?.() ?? []).map((source, index) => ({
            key: `video-source:${source.id}`,
            label: source.label,
            icon: <MonitorPlay size={14} />,
            priority: 3 + index,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "video",
                action: `source:${source.id}`,
              });
            },
          })),
        ],
        onSelect: () => {},
      });
    }

    // 右键视频元素 → 添加视频操作菜单
    const videoElements = targetElements.filter(el => el.type === "video") as VideoElement[];
    if (videoElements.length === 1) {
      const videoElement = videoElements[0];

      items.push({
        key: "open-video-note",
        ...menuText(context.board, "menus.media.openVideoNote"),
        icon: <FileText size={14} />,
        priority: 49,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.emit("tau.video-note.open", videoElement);
        },
      });

      items.push({
        key: "copy-video-link",
        ...menuText(context.board, "menus.media.copyLink"),
        icon: <Link size={14} />,
        priority: 50,
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(videoElement.src);
            toast.success(...whiteboardFeedback(context.board, "menus.media.linkCopied"));
          } catch (error) {
            console.error("复制链接失败:", error);
            toast.error(...whiteboardFeedback(context.board, "menus.media.copyLinkFailed"));
          }
        },
      });

      items.push({
        key: "download-video",
        ...menuText(context.board, "menus.media.downloadVideo"),
        icon: <Download size={14} />,
        priority: 51,
        onSelect: async () => {
          try {
            await this.media.download?.(videoElement.src);
            toast.success(...whiteboardFeedback(context.board, "menus.media.videoDownloaded"));
          } catch (error) {
            // 用户取消下载不显示错误
            if ((error as { message?: string })?.message !== "用户取消了下载") {
              console.error("下载视频失败:", error);
              toast.error(...whiteboardFeedback(context.board, "menus.media.downloadVideoFailed"));
            }
          }
        },
      });
    }

    return mediaMenu(items, "video", this.media);
  }

  onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditingElements.length > 0) return;
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    const videoFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("video") !== -1) {
        // 获取图片文件
        const file = items[i].getAsFile();
        if (file) {
          videoFiles.push(file);
        }
      }
    }

    if (videoFiles.length === 0) return;

    Promise.all(
      videoFiles.map(file => Promise.all([this.media.videoInfo(file), Promise.resolve(file)]))
    )
      .then(async videos => {
        const uploadingToast = toast.loading(
          ...whiteboardFeedback(board, "menus.media.processingVideo")
        );
        try {
          let insertPath = board.children.length;
          const { minX, minY, width, height } = board.viewPort;
          const center = {
            x: minX + width / 2,
            y: minY + height / 2,
          };
          const ops: Operation[] = [];
          for (const video of videos) {
            const [info, file] = video;

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
            if (width > 720) {
              width = 720;
              height = width / ratio;
            }

            const videoPath = await this.media.upload?.(file);
            if (videoPath) {
              ops.push({
                type: "insert_node",
                path: [insertPath],
                node: {
                  id: getUuid(),
                  type: "video",
                  src: videoPath,
                  x: center.x - width / 2,
                  y: center.y - height / 2,
                  width,
                  height,
                  naturalWidth,
                  naturalHeight,
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
            toast.success(...whiteboardFeedback(board, "menus.media.videoPasted"));
          }
        } finally {
          toast.dismiss(uploadingToast);
        }
      })
      .catch(error => {
        console.error("白板媒体粘贴失败", error);
        toast.error(...whiteboardFeedback(board, "menus.media.pasteFailed"));
      });
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
    );
  }
}
