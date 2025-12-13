import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
  SoundOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { App, Tooltip, Dropdown, Spin, Empty } from "antd";
import type { MenuProps } from "antd";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import type { CustomEditor } from "@tau/editor/src";
import ResizablePanel from "@/components/ResizablePanel";
import LocalVideo from "@/components/LocalVideo";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import useSettingStore from "@/stores/useSettingStore";
import { shouldUseLocalVideoCache } from "@/utils/video";
import {
  getVideoNoteById,
  deleteVideoNote,
  getVideoNoteItemByVideoNoteId,
  createVideoNoteItem,
  getContentById,
  createContent,
  updateContent,
} from "@/commands";
import {
  type VideoNote as IVideoNote,
  type VideoNoteItem,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
} from "@/types";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
import VideoTimestampExtension from "./extensions/VideoTimestamp";
import VideoScreenshotExtension from "./extensions/VideoScreenshot";
import { VideoController } from "./VideoController";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const { message, modal } = App.useApp();
  const uploadResource = useUploadResource();
  const autoCacheRemoteVideo = useSettingStore(
    (state) => state.setting.misc.video.autoCacheRemote,
  );

  // State
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [noteItem, setNoteItem] = useState<VideoNoteItem | null>(null);
  const [noteContent, setNoteContent] = useState<Descendant[]>(
    createEmptyEditorContent(),
  );
  const [loading, setLoading] = useState(true);

  // Refs
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);

  // Callback ref to capture video element
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
  }, []);

  // Video hooks for different platforms
  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliStreamProgress,
  } = useBilibiliVideo(videoNote?.metaInfo as BiliBiliVideoMetaInfo);

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeStreamProgress,
  } = useYoutubeVideo(videoNote?.metaInfo as YouTubeVideoMetaInfo);

  const {
    videoUrl: notionVideoUrl,
    loading: notionLoading,
    error: notionError,
    streamProgress: notionStreamProgress,
  } = useNotionVideo(videoNote?.metaInfo as NotionVideoMetaInfo);

  // Video controller for timestamp functionality
  const videoController = useMemo(() => {
    return new VideoController(
      () => videoElementRef.current,
      async (file: File) => {
        const path = await uploadResource(file);
        return path || null;
      },
    );
  }, [uploadResource]);

  // Custom extensions for editor
  const customExtensions = useMemo(() => {
    return [
      contentLinkExtension,
      fileAttachmentExtension,
      questionCardExtension,
      chatReferenceExtension,
      new VideoTimestampExtension(videoController),
      new VideoScreenshotExtension(videoController),
    ];
  }, [videoController]);

  // Load video note data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const note = await getVideoNoteById(videoNoteId);
        if (!note) {
          message.error("视频笔记不存在");
          return;
        }
        setVideoNote(note);

        // Load note item
        let item = await getVideoNoteItemByVideoNoteId(videoNoteId);
        if (item) {
          setNoteItem(item);
          const content = await getContentById(item.contentId);
          if (content) {
            setNoteContent(content.content);
          }
        }
      } catch (error) {
        console.error("Failed to load video note:", error);
        message.error("加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [videoNoteId, message]);

  // Create note item if not exists
  const ensureNoteItem = useMemoizedFn(async () => {
    if (noteItem) return noteItem;

    try {
      const emptyContent = createEmptyEditorContent();
      const contentId = await createContent(emptyContent, 0);
      if (!contentId) {
        throw new Error("Failed to create content");
      }
      const item = await createVideoNoteItem({
        videoNoteId,
        contentId,
        title: "",
      });
      setNoteItem(item);
      setNoteContent(emptyContent);
      return item;
    } catch (error) {
      console.error("Failed to create note item:", error);
      message.error("创建笔记失败");
      return null;
    }
  });

  // Throttled content save
  const { run: throttleSaveContent } = useThrottleFn(
    async (contentId: number, content: Descendant[]) => {
      try {
        await updateContent(contentId, content);
      } catch (error) {
        console.error("Failed to save content:", error);
      }
    },
    { wait: 1000 },
  );

  // Handle editor content change
  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    setNoteContent(content);
    if (noteItem) {
      throttleSaveContent(noteItem.contentId, content);
    }
  });

  // Handle editor init
  const handleEditorInit = useMemoizedFn((editor: CustomEditor) => {
    slateEditorRef.current = editor;
  });

  // Handle add note button click
  const handleAddNote = useMemoizedFn(async () => {
    const item = await ensureNoteItem();
    if (item && editorRef.current) {
      editorRef.current.focus();
    }
  });

  // Handle delete
  const handleDelete = useMemoizedFn(async () => {
    modal.confirm({
      title: "确认删除",
      content: "删除后无法恢复，是否确认删除此视频笔记？",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteVideoNote(videoNoteId);
          message.success("删除成功");
          // TODO: Navigate back or close tab
        } catch (error) {
          console.error("Failed to delete:", error);
          message.error("删除失败");
        }
      },
    });
  });

  // More menu items
  const moreMenuItems: MenuProps["items"] = [
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: handleDelete,
    },
  ];

  // Get video source based on type
  const getVideoSrc = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return metaInfo.filePath;
      case "remote":
        return metaInfo.url;
      case "bilibili":
        return bilibiliVideoUrl;
      case "youtube":
        return youtubeVideoUrl;
      case "notion":
        return notionVideoUrl;
      default:
        return null;
    }
  };

  // Check if video is loading
  const isVideoLoading = () => {
    if (!videoNote) return true;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "bilibili":
        return bilibiliLoading;
      case "youtube":
        return youtubeLoading;
      case "notion":
        return notionLoading;
      default:
        return false;
    }
  };

  // Get video error
  const getVideoError = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "bilibili":
        return bilibiliError;
      case "youtube":
        return youtubeError;
      case "notion":
        return notionError;
      default:
        return null;
    }
  };

  // Check if should use local video
  const shouldUseLocalVideo = () => {
    if (!videoNote) return false;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return true;
      case "remote":
        return shouldUseLocalVideoCache(metaInfo.url, autoCacheRemoteVideo);
      case "notion":
        return (metaInfo as NotionVideoMetaInfo).cache !== false;
      default:
        return false;
    }
  };

  // Render video loader for special platforms
  const renderVideoLoader = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "bilibili":
        return (
          <BilibiliVideoLoader
            loading={bilibiliLoading}
            error={bilibiliError}
            streamProgress={bilibiliStreamProgress}
          />
        );
      case "youtube":
        return (
          <YoutubeVideoLoader
            loading={youtubeLoading}
            error={youtubeError}
            streamProgress={youtubeStreamProgress}
          />
        );
      case "notion":
        return (
          <NotionVideoLoader
            loading={notionLoading}
            error={notionError}
            streamProgress={notionStreamProgress}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!videoNote) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Empty description="视频笔记不存在" />
      </div>
    );
  }

  const videoSrc = getVideoSrc();
  const videoLoading = isVideoLoading();
  const videoError = getVideoError();
  const useLocalVideo = shouldUseLocalVideo();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Tooltip title="转录 (即将推出)">
            <button
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              disabled
            >
              <SoundOutlined />
              <span>转录</span>
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          {!noteItem && (
            <Tooltip title="添加笔记">
              <button
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-500 px-3 text-sm text-white hover:bg-blue-600"
                onClick={handleAddNote}
              >
                <PlusOutlined />
                <span>添加笔记</span>
              </button>
            </Tooltip>
          )}

          <Dropdown menu={{ items: moreMenuItems }} trigger={["click"]}>
            <button className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
              <MoreOutlined />
            </button>
          </Dropdown>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanel
          id="video-note-view"
          initialLeftRatio={0.5}
          minLeft={300}
          minRight={400}
          left={
            <div className="flex h-full flex-col overflow-hidden">
              {/* Video section */}
              <div className="flex shrink-0 items-center justify-center p-4">
                <div
                  className="relative w-full overflow-hidden rounded-xl bg-black"
                  style={{
                    maxWidth: 800,
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                  }}
                >
                  {renderVideoLoader()}

                  {!videoLoading && !videoError && videoSrc && (
                    <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                      {useLocalVideo ? (
                        <LocalVideo
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : (
                        <video
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Description / Transcript placeholder */}
              <div className="flex-1 overflow-auto border-t border-gray-200 p-4 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {videoNote.description || videoNote.transcript ? (
                    <div className="whitespace-pre-wrap">
                      {videoNote.description || videoNote.transcript}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      <span>转录内容将在此处显示</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          }
          right={
            <div className="h-full overflow-auto p-4">
              {noteItem ? (
                <Editor
                  ref={editorRef}
                  initValue={noteContent}
                  onChange={handleEditorChange}
                  extensions={customExtensions}
                  readonly={false}
                  onInit={handleEditorInit}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <button
                    className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
                    onClick={handleAddNote}
                  >
                    <EditOutlined className="text-lg" />
                    <span>点击开始记笔记</span>
                  </button>
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
};

export default VideoNoteView;
