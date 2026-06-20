import {
  Video,
  Link,
  Download,
  Upload,
  FolderOpen,
  MonitorPlay,
  Youtube,
  FileText,
} from "lucide-react";
import { v4 as getUuid } from "uuid";
import { message } from "antd";
import { uploadResource } from "@/hooks/useUploadResource";
import { getVideoInfo } from "@/utils";
import { downloadFile } from "@/utils/download";
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
import { DOMSizeMeasurer } from "../services/DOMSizeMeasurer";
import VideoElementComponent from "../components/VideoElement";

export class VideoPlugin extends CommonPlugin implements IBoardPlugin {
  name = "video";

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
        getColorTheme: () => "rose",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (element, targetWidth) => {
          const video = element as VideoElement;
          return DOMSizeMeasurer.measureMediaHeight(
            video.naturalWidth || video.width || targetWidth,
            video.naturalHeight || video.height || targetWidth * 0.5625, // 16:9
            targetWidth,
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
        label: "视频",
        icon: <Video size={14} />,
        priority: 160,
        children: [
          {
            key: "video-local",
            label: "本地上传",
            icon: <Upload size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "local",
              });
            },
          },
          {
            key: "video-resource",
            label: "资源库",
            icon: <FolderOpen size={14} />,
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "resource",
              });
            },
          },
          {
            key: "video-url",
            label: "网络地址",
            icon: <Link size={14} />,
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "url",
              });
            },
          },
          {
            key: "video-bilibili",
            label: "Bilibili",
            icon: <MonitorPlay size={14} />,
            priority: 3,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "bilibili",
              });
            },
          },
          {
            key: "video-youtube",
            label: "YouTube",
            icon: <Youtube size={14} />,
            priority: 4,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "youtube",
              });
            },
          },
          {
            key: "video-notion",
            label: "Notion",
            icon: <FileText size={14} />,
            priority: 5,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "video",
                action: "notion",
              });
            },
          },
        ],
        onSelect: () => {},
      });
    }

    // 右键视频元素 → 添加视频操作菜单
    const videoElements = targetElements.filter(
      (el) => el.type === "video",
    ) as VideoElement[];
    if (videoElements.length === 1) {
      const videoElement = videoElements[0];

      items.push({
        key: "copy-video-link",
        label: "复制链接",
        icon: <Link size={14} />,
        priority: 50,
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(videoElement.src);
            message.success("链接已复制到剪贴板");
          } catch (error) {
            console.error("复制链接失败:", error);
            message.error("复制链接失败");
          }
        },
      });

      items.push({
        key: "download-video",
        label: "下载视频",
        icon: <Download size={14} />,
        priority: 51,
        onSelect: async () => {
          try {
            await downloadFile(videoElement.src);
            message.success("视频下载成功");
          } catch (error: any) {
            // 用户取消下载不显示错误
            if (error?.message !== "用户取消了下载") {
              console.error("下载视频失败:", error);
              message.error("下载视频失败");
            }
          }
        },
      });
    }

    return items;
  }

  onPaste(event: ClipboardEvent, board: Board) {
    if (board.isEditingElements.length > 0) return;
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
      videoFiles.map((file) =>
        Promise.all([getVideoInfo(file), Promise.resolve(file)]),
      ),
    ).then(async (videos) => {
      message.loading({
        key: "uploading-video",
        content: "正在处理视频，请稍候...",
        duration: 0,
      });
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

        const videoPath = await uploadResource(file);
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
      if (ops.length > 0) {
        board.apply(ops);
        message.success("视频粘贴成功");
      }
      message.destroy("uploading-video");
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
