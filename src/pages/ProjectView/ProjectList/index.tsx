import { useEffect, useState, useMemo } from "react";
import { Descendant } from "slate";
import {
  Dropdown,
  Empty,
  MenuProps,
  App,
  Modal,
  Input,
  Button,
  Tabs,
} from "antd";
import { HomeOutlined, PlusOutlined, GlobalOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import ProjectItem from "./ProjectItem";
import If from "@/components/If";
import For from "@/components/For";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

import styles from "./index.module.less";
import {
  CreateProjectItem,
  EProjectItemType,
  ICard,
  Project as IProject,
  WhiteBoard,
  IndexType,
  SearchResult,
} from "@/types";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import useAddRefCard from "./ProjectItem/useAddRefCard.ts";
import useAddRefWhiteBoard from "./useAddRefWhiteBoard.ts";
import {
  getFileBaseName,
  readTextFile,
  selectFile,
  getProjectById,
  getAllWhiteBoards,
  getAllCards,
  createEmptyVideoNote,
  createWhiteBoardContent,
  addRootProjectItem,
  createDataTable,
  createWebLink,
} from "@/commands";
import {
  getContentLength,
  importFromMarkdown,
  normalizeWebviewUrl,
  getWebviewTitleFromUrl,
} from "@/utils";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];
import { createNotionPage } from "@/commands/notion";
import useSettingStore from "@/stores/useSettingStore";
import YoutubeVideoSelectModal, {
  type YoutubeVideoSelectResult,
} from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal, {
  type BilibiliVideoSelectResult,
} from "@/components/BilibiliVideoSelectModal";
import NotionVideoSelectModal, {
  type NotionVideoSelectResult,
} from "@/components/NotionVideoSelectModal";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import NotionSyncModal, {
  NotionSyncConfig,
} from "@/components/NotionSyncModal";
import { createNotionSync, updateNotionSync } from "@/commands/notion-sync";
import { generateContentHash } from "@/utils/content-hash";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import leftSidebarIcon from "@/assets/icons/sidebar-left.svg";
import { AnimatePresence, motion } from "framer-motion";
import { WebLinkSourceType } from "@/types";

const Project = () => {
  const { message } = App.useApp();
  const uploadResource = useUploadResource();
  const { id } = useTabParams(TabType.ProjectDetail);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const { setting } = useSettingStore((state) => ({ setting: state.setting }));
  const [hideSidebar, setHideSidebar] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "project-list-sidebar-width",
    {
      defaultValue: 300,
    },
  );
  const [project, setProject] = useState<IProject | null>(null);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);

  const [webVideoModalOpen, setWebVideoModalOpen] = useState(false);

  const [webviewModalOpen, setWebviewModalOpen] = useState(false);
  const [webviewModalTab, setWebviewModalTab] = useState<"url" | "local">(
    "url",
  );
  const [webviewRemoteUrl, setWebviewRemoteUrl] = useState("");
  const [webviewLocalUrl, setWebviewLocalUrl] = useState("");
  const [webviewTitle, setWebviewTitle] = useState("");
  const [webviewFileName, setWebviewFileName] = useState("");
  const [webviewUploading, setWebviewUploading] = useState(false);

  const [bilibiliModalOpen, setBilibiliModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [notionSyncModalOpen, setNotionSyncModalOpen] = useState(false);

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllWhiteBoards().then((whiteBoards) => {
      setWhiteBoards(whiteBoards);
    });
  }, []);

  const refresh = useMemoizedFn(() => {
    getProjectById(Number(id))
      .then((res) => {
        setProject(res);
      })
      .catch((e) => {
        console.error(e);
      });
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRemoteConfirm = useMemoizedFn(
    async (result: RemoteVideoSelectResult) => {
      if (!project) {
        message.error("项目尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote({
          type: "remote",
          url: result.url,
        });
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: `在线视频 - ${result.url}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          navigateTo(TabType.ProjectDetail, {
            id: newProject.id,
            itemId: projectItem.id,
          });
        }
        setProject(newProject);
        setWebVideoModalOpen(false);
        message.success("在线视频笔记添加成功");
      } catch (error) {
        console.error("添加在线视频失败:", error);
        message.error("添加在线视频失败");
      }
    },
  );

  const handleBilibiliConfirm = useMemoizedFn(
    async (result: BilibiliVideoSelectResult) => {
      if (!project) {
        message.error("项目尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote(result.metaInfo);
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: result.title || `Bilibili 视频 - ${result.metaInfo.bvid}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          navigateTo(TabType.ProjectDetail, {
            id: newProject.id,
            itemId: projectItem.id,
          });
        }
        setProject(newProject);
        setBilibiliModalOpen(false);
        message.success("Bilibili 视频笔记添加成功");
      } catch (error) {
        console.error("添加 Bilibili 视频失败:", error);
        message.error("添加 Bilibili 视频失败");
      }
    },
  );

  const handleNotionConfirm = useMemoizedFn(
    async (result: NotionVideoSelectResult) => {
      if (!project) {
        message.error("项目尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote(result.metaInfo);
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: "Notion 视频笔记",
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          navigateTo(TabType.ProjectDetail, {
            id: newProject.id,
            itemId: projectItem.id,
          });
        }
        setNotionModalOpen(false);
        message.success("Notion 视频添加成功");
      } catch (error) {
        console.error("添加 Notion 视频失败:", error);
        message.error("添加 Notion 视频失败");
      }
    },
  );

  const handleYoutubeConfirm = useMemoizedFn(
    async (result: YoutubeVideoSelectResult) => {
      if (!project) {
        message.error("项目尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote({
          type: "youtube",
          url: result.url,
          videoStream: result.videoStream,
          audioStream: result.audioStream,
        });

        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: result.title || `YouTube 视频 - ${result.url}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };
        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: projectItem.id,
            },
            `项目 - ${projectItem.title || `#${projectItem.id}`}`,
          );
        }
        setProject(newProject);
        setYoutubeModalOpen(false);
        message.success("YouTube 视频笔记添加成功！");
      } catch (e) {
        console.error(e);
        message.error("添加 YouTube 视频失败");
      }
    },
  );

  const {
    onOk: onCardOk,
    onCancel: onCardCancel,
    selectCardModalOpen,
    openSelectCardModal,
    excludeCardIds,
  } = useAddRefCard(cards, Number(id));

  const initialCardContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const handleCardSelect = async (
    selectedResults: SearchResult | SearchResult[],
  ) => {
    const results = Array.isArray(selectedResults)
      ? selectedResults
      : [selectedResults];
    const selectedCardIds = results.map((result) => result.id);
    const newSelectedCards = selectedCardIds
      .map((id) => cards.find((card) => card.id === id))
      .filter((card): card is ICard => !!card);

    const res = await onCardOk(newSelectedCards);
    if (res && res[0]) {
      setProject(res[0] as IProject);
    }
  };

  const {
    selectedWhiteBoards,
    onChange: onWhiteBoardChange,
    onOk: onWhiteBoardOk,
    onCancel: onWhiteBoardCancel,
    selectWhiteBoardModalOpen,
    openSelectWhiteBoardModal,
    excludeWhiteBoardIds,
    multiple,
  } = useAddRefWhiteBoard(whiteBoards, Number(id));

  const handleOnSelectWhiteboardOk = useMemoizedFn(
    async (whiteBoards: WhiteBoard[]) => {
      const res = await onWhiteBoardOk(whiteBoards);
      if (res && res[0]) {
        setProject(res[0] as IProject);
      }
    },
  );

  const handleNotionSyncModalOk = useMemoizedFn(
    async (config: NotionSyncConfig) => {
      if (!project) return;

      const token = setting.integration.notion.token;
      if (!token || !setting.integration.notion.enabled) {
        message.error("请先在设置中配置 Notion 集成");
        return;
      }

      try {
        let pageId = config.pageId;
        const pageTitle = config.pageTitle || "新文档";

        // 如果需要创建新页面
        if (config.createNew && config.parentId) {
          const result = await createNotionPage(
            token,
            config.parentId,
            pageTitle,
            [],
          );

          if (!result.success || !result.pageId) {
            message.error(result.error || "创建 Notion 页面失败");
            return;
          }

          pageId = result.pageId;
        }

        // 创建初始内容
        const initialContent: Descendant[] = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ];

        // 计算内容哈希
        const contentHash = generateContentHash(initialContent);

        // 创建 NotionSync 记录
        const notionSync = await createNotionSync({
          pageId,
          syncMode: config.syncMode,
          lastLocalContentHash: contentHash,
          pendingSync: false,
        });

        // 立即同步初始内容到 Notion，避免创建后检测到冲突
        try {
          if (config.syncMode === "json") {
            // JSON 模式：创建代码块
            const jsonContent = JSON.stringify(initialContent, null, 2);
            const { appendNotionBlock } = await import("@/commands/notion");
            const result = await appendNotionBlock(token, pageId, {
              type: "code",
              code: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: jsonContent },
                  },
                ],
                language: "javascript",
              },
            });

            // 如果创建成功，更新 codeBlockId
            if (result.success && result.blockId) {
              await updateNotionSync(notionSync.id, {
                codeBlockId: result.blockId,
              });
            }
          }
          // 双向模式下，空内容不需要同步
        } catch (syncError) {
          console.warn("初始同步失败，将在编辑时重试:", syncError);
        }

        // 创建 ProjectItem
        const createProjectItem: CreateProjectItem = {
          title: pageTitle,
          content: initialContent,
          children: [],
          refType: "notion-sync",
          refId: notionSync.id,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [newProject, item] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );

        if (item) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: item.id,
            },
            `项目 - ${item.title || `#${item.id}`}`,
          );
        }

        setProject(newProject);
        setNotionSyncModalOpen(false);
        message.success("Notion 文档创建成功！");
      } catch (error: unknown) {
        console.error("创建 Notion 文档失败:", error);
        message.error(error instanceof Error ? error.message : "创建失败");
      }
    },
  );

  const createWebLinkRecord = useMemoizedFn(
    async (title: string, url: string, sourceType: WebLinkSourceType) => {
      const finalTitle = title.trim() || url;
      return await createWebLink({
        title: finalTitle,
        url,
        sourceType,
      });
    },
  );

  const handleSelectWebviewFile = useMemoizedFn(async () => {
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    try {
      setWebviewUploading(true);
      message.loading({
        key: "upload-webview-html",
        content: "正在上传 HTML 文件...",
        duration: 0,
      });
      const fileName = await getFileBaseName(filePath);
      const fileTitle = await getFileBaseName(filePath, true);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        message.error({
          key: "upload-webview-html",
          content: "上传 HTML 文件失败",
        });
        return;
      }
      setWebviewLocalUrl(uploadedUrl);
      setWebviewFileName(fileName);
      setWebviewTitle(fileTitle || fileName);
      message.success({
        key: "upload-webview-html",
        content: "HTML 文件已添加",
      });
      setWebviewModalTab("local");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error({
        key: "upload-webview-html",
        content: "选择 HTML 文件失败",
      });
    } finally {
      setWebviewUploading(false);
    }
  });

  const addMenuItems: MenuProps["items"] = [
    {
      key: "add-project-item",
      label: "添加文档",
    },
    {
      key: "add-notion-document-project-item",
      label: "添加 Notion 文档",
    },
    {
      key: "add-white-board-project-item",
      label: "添加白板",
    },
    {
      key: "add-video-note-project-item",
      label: "添加视频",
      children: [
        {
          key: "add-local-video-note-project-item",
          label: "本地视频",
        },
        {
          key: "add-remote-video-note-project-item",
          label: "远程视频",
        },
        {
          key: "add-bilibili-video-note-project-item",
          label: "Bilibili 视频",
        },
        {
          key: "add-youtube-video-note-project-item",
          label: "YouTube 视频",
        },
        {
          key: "add-notion-video-note-project-item",
          label: "Notion 视频",
        },
      ],
    },
    {
      key: "add-webview-project-item",
      label: "添加网页",
    },
    {
      key: "add-table-project-item",
      label: "添加表格",
    },
    {
      key: "link-card-project-item",
      label: "关联卡片",
    },
    {
      key: "link-white-board-project-item",
      label: "关联白板",
    },
    {
      key: "import-markdown",
      label: "导入Markdown",
    },
  ];

  const handleAddMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (!project) return;
      if (key === "add-project-item") {
        const createProjectItem: CreateProjectItem = {
          title: "新文档",
          content: [
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "" }],
            },
          ],
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        };
        const [newProject, item] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (item) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: item.id,
            },
            `项目 - ${item.title || `#${item.id}`}`,
          );
        }
        setProject(newProject);
      } else if (key === "add-notion-document-project-item") {
        setNotionSyncModalOpen(true);
      } else if (key === "add-white-board-project-item") {
        const whiteBoardContent = await createWhiteBoardContent({
          name: "新白板",
          imgUrl: "",
          data: {
            children: [],
            viewPort: {
              zoom: 1,
              minX: 0,
              minY: 0,
              width: 0,
              height: 0,
            },
            selection: {
              selectArea: null,
              selectedElements: [],
            },
            presentationSequences: [],
          },
        });
        const createProjectItem: CreateProjectItem = {
          title: "新白板",
          content: [],
          whiteBoardContentId: whiteBoardContent.id,
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.WhiteBoard,
          count: 0,
        };
        const [newProject, item] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (item) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: item.id,
            },
            `项目 - ${item.title || `#${item.id}`}`,
          );
        }
        setProject(newProject);
      } else if (key === "add-local-video-note-project-item") {
        // 选择视频文件
        const filePath = await selectFile({
          properties: ["openFile"],
          filters: [
            {
              name: "Video",
              extensions: ["mp4", "mov", "avi", "mkv", "flv", "wmv", "webm"],
            },
          ],
        });
        if (!filePath) return;
        const item = await createEmptyVideoNote({
          type: "local",
          filePath: filePath[0],
        });
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }
        const fileName = await getFileBaseName(filePath[0], true);
        const createProjectItem: CreateProjectItem = {
          title: fileName,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };
        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: projectItem.id,
            },
            `项目 - ${projectItem.title || `#${projectItem.id}`}`,
          );
        }
        setProject(newProject);
      } else if (key === "add-remote-video-note-project-item") {
        setWebVideoModalOpen(true);
      } else if (key === "add-bilibili-video-note-project-item") {
        setBilibiliModalOpen(true);
      } else if (key === "add-youtube-video-note-project-item") {
        setYoutubeModalOpen(true);
      } else if (key === "add-notion-video-note-project-item") {
        setNotionModalOpen(true);
      } else if (key === "add-webview-project-item") {
        setWebviewModalOpen(true);
      } else if (key === "add-table-project-item") {
        const dataTable = await createDataTable({
          columns: DEFAULT_COLUMNS,
          rows: DEFAULT_ROWS,
          activeViewId: null,
        });
        const createProjectItem: CreateProjectItem = {
          title: "新表格",
          content: [],
          children: [],
          refType: "data-table",
          refId: dataTable.id,
          projectItemType: EProjectItemType.TableView,
          count: 0,
          whiteBoardContentId: 0,
        };
        const [newProject, item] = await addRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (item) {
          navigateTo(
            TabType.ProjectDetail,
            {
              id: newProject.id,
              itemId: item.id,
            },
            `项目 - ${item.title || `#${item.id}`}`,
          );
        }
        setProject(newProject);
      } else if (key === "link-card-project-item") {
        openSelectCardModal();
      } else if (key === "link-white-board-project-item") {
        openSelectWhiteBoardModal();
      } else if (key === "import-markdown") {
        const filePath = await selectFile({
          properties: ["openFile", "multiSelections"],
          filters: [
            {
              name: "Markdown",
              extensions: ["md"],
            },
          ],
        }).catch((e) => {
          console.error(e);
          return null;
        });
        if (!filePath) return;
        for (const path of filePath) {
          const markdown = await readTextFile(path);
          const content = importFromMarkdown(markdown, ["yaml"]);
          const fileName = await getFileBaseName(path, true);
          const [newProject, item] = await addRootProjectItem(project.id, {
            title: fileName,
            content,
            children: [],
            refType: "",
            refId: 0,
            projectItemType: EProjectItemType.Document,
            count: getContentLength(content),
            whiteBoardContentId: 0,
          });
          if (item) {
            navigateTo(
              TabType.ProjectDetail,
              {
                id: newProject.id,
                itemId: item.id,
              },
              `项目 - ${item.title || `#${item.id}`}`,
            );
          }
          setProject(newProject);
        }
      }
    },
  );

  if (!project) return null;

  return (
    <>
      <ResizeableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        disableResize={false}
        className="h-full"
      >
        <div className={styles.list}>
          <div className={styles.header}>
            <div className={styles.title}>
              <HomeOutlined
                onClick={() => {
                  navigateTo(TabType.ProjectList);
                }}
              />
              {project.title}
            </div>
            <div className={styles.icons}>
              <div className={styles.icon} onClick={onFoldSidebar}>
                <SVG
                  className="cursor-pointer"
                  src={leftSidebarIcon}
                  onClick={onFoldSidebar}
                />
              </div>
              <Dropdown
                menu={{
                  items: addMenuItems,
                  onClick: handleAddMenuClick,
                }}
              >
                <div className={styles.icon}>
                  <PlusOutlined />
                </div>
              </Dropdown>
            </div>
          </div>
          <div className={styles.divider}></div>
          <div className={styles.contentArea}>
            <If condition={project.children.length === 0}>
              <Empty description={"项目下暂无文档"} />
            </If>
            <For
              data={project.children}
              renderItem={(projectItemId, index) => (
                <ProjectItem
                  projectItemId={projectItemId}
                  isRoot
                  key={projectItemId}
                  path={[index]}
                  parentProjectItemId={project.id}
                  parentChildren={project.children}
                  cards={cards}
                  whiteBoards={whiteBoards}
                  refreshProject={refresh}
                />
              )}
            />
          </div>
          <ContentSelectorModal
            title={"选择关联卡片"}
            open={selectCardModalOpen}
            onCancel={onCardCancel}
            onSelect={handleCardSelect}
            contentType="card"
            multiple={false}
            excludeIds={excludeCardIds}
            initialContents={initialCardContents}
            extensions={customExtensions}
          />
          <SelectWhiteBoardModal
            title={"选择关联白板"}
            selectedWhiteBoards={selectedWhiteBoards}
            onChange={onWhiteBoardChange}
            open={selectWhiteBoardModalOpen}
            allWhiteBoards={whiteBoards}
            onCancel={onWhiteBoardCancel}
            onOk={handleOnSelectWhiteboardOk}
            excludeWhiteBoardIds={excludeWhiteBoardIds}
            multiple={multiple}
          />
          <RemoteVideoSelectModal
            open={webVideoModalOpen}
            onCancel={() => setWebVideoModalOpen(false)}
            onConfirm={handleRemoteConfirm}
          />
          <YoutubeVideoSelectModal
            open={youtubeModalOpen}
            onCancel={() => setYoutubeModalOpen(false)}
            onConfirm={handleYoutubeConfirm}
          />
          <Modal
            open={webviewModalOpen}
            title="添加网页"
            onCancel={() => {
              setWebviewModalOpen(false);
              setWebviewRemoteUrl("");
              setWebviewLocalUrl("");
              setWebviewTitle("");
              setWebviewFileName("");
              setWebviewUploading(false);
              setWebviewModalTab("url");
            }}
            onOk={async () => {
              try {
                let linkTitle = "";
                let linkUrl = "";
                let sourceType: WebLinkSourceType = "remote";

                if (webviewModalTab === "url") {
                  if (!webviewRemoteUrl.trim()) {
                    message.error("请输入网址");
                    return;
                  }
                  const url = normalizeWebviewUrl(webviewRemoteUrl);
                  if (!url) {
                    message.error("请输入网址");
                    return;
                  }
                  linkUrl = url;
                  linkTitle = getWebviewTitleFromUrl(url);
                  sourceType = "remote";
                } else {
                  if (!webviewLocalUrl) {
                    message.error("请先选择本地 HTML 文件");
                    return;
                  }
                  linkUrl = webviewLocalUrl;
                  linkTitle =
                    webviewTitle.trim() || webviewFileName || "本地网页";
                  sourceType = "local";
                }

                const webLink = await createWebLinkRecord(
                  linkTitle,
                  linkUrl,
                  sourceType,
                );

                const createProjectItem: CreateProjectItem = {
                  title: webLink.title,
                  content: [],
                  children: [],
                  refType: "web-link",
                  refId: webLink.id,
                  projectItemType: EProjectItemType.WebView,
                  count: 0,
                  whiteBoardContentId: 0,
                };

                const [newProject, item] = await addRootProjectItem(
                  project.id,
                  createProjectItem,
                );
                if (item) {
                  navigateTo(
                    TabType.ProjectDetail,
                    {
                      id: newProject.id,
                      itemId: item.id,
                    },
                    `项目 - ${item.title || `#${item.id}`}`,
                  );
                }
                setProject(newProject);
                setWebviewModalOpen(false);
                setWebviewRemoteUrl("");
                setWebviewLocalUrl("");
                setWebviewTitle("");
                setWebviewFileName("");
                setWebviewModalTab("url");
              } finally {
                setWebviewUploading(false);
              }
            }}
          >
            <Tabs
              activeKey={webviewModalTab}
              onChange={(key) => setWebviewModalTab(key as "url" | "local")}
              items={[
                {
                  key: "url",
                  label: "远程网址",
                  children: (
                    <Input
                      placeholder="请输入网址"
                      value={webviewRemoteUrl}
                      onChange={(e) => setWebviewRemoteUrl(e.target.value)}
                      prefix={<GlobalOutlined />}
                      autoFocus={webviewModalTab === "url"}
                    />
                  ),
                },
                {
                  key: "local",
                  label: "本地 HTML",
                  children: (
                    <>
                      <Input
                        placeholder="请输入网页标题"
                        value={webviewTitle}
                        onChange={(e) => setWebviewTitle(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                      <Button
                        block
                        onClick={handleSelectWebviewFile}
                        loading={webviewUploading}
                      >
                        选择本地 HTML 文件
                      </Button>
                      {webviewFileName && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: "#8c8c8c",
                          }}
                        >
                          当前文件：{webviewFileName}
                        </div>
                      )}
                    </>
                  ),
                },
              ]}
            />
          </Modal>
          <BilibiliVideoSelectModal
            open={bilibiliModalOpen}
            onCancel={() => setBilibiliModalOpen(false)}
            onConfirm={handleBilibiliConfirm}
          />

          <NotionVideoSelectModal
            open={notionModalOpen}
            onCancel={() => setNotionModalOpen(false)}
            onConfirm={handleNotionConfirm}
          />

          <NotionSyncModal
            open={notionSyncModalOpen}
            token={setting.integration.notion.token}
            onOk={handleNotionSyncModalOk}
            onCancel={() => setNotionSyncModalOpen(false)}
          />
        </div>
      </ResizeableAndHideableSidebar>
      <AnimatePresence>
        {hideSidebar && (
          <motion.div
            className="absolute top-6 left-5 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SVG
              className="cursor-pointer"
              src={rightSidebarIcon}
              onClick={onFoldSidebar}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Project;
