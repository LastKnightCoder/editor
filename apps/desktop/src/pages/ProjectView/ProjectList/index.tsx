import { useEffect, useState, useMemo, useRef } from "react";
import { Dropdown, Empty, MenuProps, App } from "antd";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
import { ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import useTabParams from "@/hooks/useTabParams";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import ProjectItem from "./ProjectItem";
import If from "@/components/If";
import For from "@/components/For";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SelectDropDown from "@/components/SelectDropDown";

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
import useAddRefPdf from "./ProjectItem/useAddRefPdf";
import useAddRefEpub from "./ProjectItem/useAddRefEpub";
import { useProjectItemModalStates } from "../shared/hooks/useProjectItemModalStates";
import { useWebLinkHandlers } from "../shared/hooks/useWebLinkHandlers";
import {
  useVideoHandlers,
  createRootVideoStrategy,
} from "../shared/hooks/useVideoHandlers";
import {
  usePdfHandlers,
  createRootPdfStrategy,
  createProjectItemFromPdf,
} from "../shared/hooks/usePdfHandlers";
import {
  useEpubHandlers,
  createRootEpubStrategy,
  createProjectItemFromEpub,
} from "../shared/hooks/useEpubHandlers";
import { useNotionSyncHandlers } from "../shared/hooks/useNotionSyncHandlers";
import { ADD_MENU_ITEMS } from "../shared/constants/menuItems";
import { ModalKey } from "../shared/constants/modalKeys";
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
  getProjectList,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import { importLocalBook } from "../shared/utils/bookImport";
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
import useSettingStore from "@/stores/useSettingStore";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import NotionVideoSelectModal from "@/components/NotionVideoSelectModal";
import RemoteVideoSelectModal from "@/components/RemoteVideoSelectModal";
import RemotePdfSelectModal from "@/components/RemotePdfSelectModal";
import RemoteEpubSelectModal from "@/components/RemoteEpubSelectModal";
import NotionSyncModal from "@/components/NotionSyncModal";
import WebViewSelectModal, {
  type WebViewSelectResult,
} from "@/components/WebViewSelectModal";
import SelectPdfModal from "@/components/SelectPdfModal";
import SelectEpubModal from "@/components/SelectEpubModal";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import leftSidebarIcon from "@/assets/icons/sidebar-left.svg";
import { AnimatePresence, motion } from "framer-motion";
import classnames from "classnames";
import usePdfsStore from "@/stores/usePdfsStore";
import useEpubsStore from "@/stores/useEpubsStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

const Project = () => {
  const { message } = App.useApp();
  const uploadResource = useUploadResource();
  const { id } = useTabParams(TabType.ProjectDetail);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const { setting } = useSettingStore((state) => ({ setting: state.setting }));
  const [hideSidebar, setHideSidebar] = useState(false);
  const { divideCalass } = useThemeColors();
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "project-list-sidebar-width",
    {
      defaultValue: 300,
    },
  );
  const [project, setProject] = useState<IProject | null>(null);
  const [allProjects, setAllProjects] = useState<IProject[]>([]);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);
  const { pdfs, initPdfs, createPdf } = usePdfsStore(
    useShallow((state) => ({
      pdfs: state.pdfs,
      initPdfs: state.initPdfs,
      createPdf: state.createPdf,
    })),
  );
  const { epubs, initEpubs, createEpub } = useEpubsStore(
    useShallow((state) => ({
      epubs: state.epubs,
      initEpubs: state.initEpubs,
      createEpub: state.createEpub,
    })),
  );
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { modalStates, openModal, closeModal } = useProjectItemModalStates();
  const { createWebLinkRecord, handleSelectWebviewFile } = useWebLinkHandlers({
    uploadResource,
    messageKeyPrefix: "upload",
  });

  const videoStrategy = useMemo(
    () =>
      createRootVideoStrategy({
        project,
        addRootProjectItem,
        setProject,
        navigateTo: (_tabType, params, title) =>
          navigateTo(TabType.ProjectDetail, params, title),
      }),
    [project, navigateTo],
  );

  const pdfStrategy = useMemo(
    () =>
      createRootPdfStrategy({
        project,
        addRootProjectItem,
        setProject,
        navigateTo: (_tabType, params, title) =>
          navigateTo(TabType.ProjectDetail, params, title),
      }),
    [project, navigateTo],
  );

  const epubStrategy = useMemo(
    () =>
      createRootEpubStrategy({
        project,
        addRootProjectItem,
        setProject,
        navigateTo: (_tabType, params, title) =>
          navigateTo(TabType.ProjectDetail, params, title),
      }),
    [project, navigateTo],
  );

  const {
    handleYoutubeConfirm,
    handleBilibiliConfirm,
    handleNotionConfirm,
    handleRemoteVideoConfirm,
  } = useVideoHandlers({
    closeModal,
    strategy: videoStrategy,
  });

  const { handleRemotePdfConfirm, handleSelectPdfConfirm } = usePdfHandlers({
    closeModal,
    strategy: pdfStrategy,
  });

  const { handleRemoteEpubConfirm, handleSelectEpubConfirm } = useEpubHandlers({
    closeModal,
    strategy: epubStrategy,
  });

  const { handleNotionSyncModalOk } = useNotionSyncHandlers({
    closeModal,
    strategy: {
      addProjectItem: async (createItem) => {
        if (!project) {
          message.error("项目尚未加载完成");
          return;
        }
        const [newProject, projectItem] = await addRootProjectItem(
          project.id,
          createItem,
        );
        if (projectItem) {
          navigateTo(TabType.ProjectDetail, {
            id: newProject.id,
            itemId: projectItem.id,
          });
        }
        setProject(newProject);
      },
    },
    getSetting: () => useSettingStore.getState().setting,
  });

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleSwitchProject = useMemoizedFn((proj: IProject) => {
    navigateTo(TabType.ProjectDetail, { id: proj.id });
  });

  const handleToggleProjectDropdown = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowProjectDropdown(!showProjectDropdown);
  });

  useEffect(() => {
    getProjectList().then((projects) => {
      setAllProjects(projects);
    });
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllWhiteBoards().then((whiteBoards) => {
      setWhiteBoards(whiteBoards);
    });
  }, []);

  useDatabaseChangeEffect(() => {
    return (async () => {
      await initPdfs();
      await initEpubs();
    })();
  }, [initPdfs, initEpubs]);

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

  const handleWebviewConfirm = useMemoizedFn(
    async (result: WebViewSelectResult) => {
      if (!project) {
        message.error("项目尚未加载完成");
        return;
      }

      try {
        const webLink = await createWebLinkRecord(
          result.title,
          result.url,
          result.sourceType,
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
        closeModal(ModalKey.Webview);
        message.success("网页添加成功");
      } catch (error) {
        console.error("添加网页失败:", error);
        message.error("添加网页失败");
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

  const {
    selectPdfModalOpen,
    openSelectPdfModal,
    onOk: onSelectPdfOk,
    onCancel: onSelectPdfCancel,
    selectedPdfId,
    onSelect: onPdfSelect,
    excludePdfIds,
  } = useAddRefPdf(pdfs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectPdfConfirm,
  });

  const {
    selectEpubModalOpen,
    openSelectEpubModal,
    onOk: onSelectEpubOk,
    onCancel: onSelectEpubCancel,
    selectedEpubId,
    onSelect: onEpubSelect,
    excludeEpubIds,
  } = useAddRefEpub(epubs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectEpubConfirm,
  });

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
        openModal(ModalKey.NotionSync);
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
        openModal(ModalKey.WebVideo);
      } else if (key === "add-bilibili-video-note-project-item") {
        openModal(ModalKey.Bilibili);
      } else if (key === "add-youtube-video-note-project-item") {
        openModal(ModalKey.Youtube);
      } else if (key === "add-notion-video-note-project-item") {
        openModal(ModalKey.Notion);
      } else if (key === "add-webview-project-item") {
        openModal(ModalKey.Webview);
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
      } else if (key === "add-local-pdf-project-item") {
        try {
          const fileInfo = await importLocalBook("pdf");
          if (!fileInfo) return;
          const pdf = await createPdf({
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            isLocal: true,
            remoteUrl: "",
            tags: [],
            category: "",
          });
          await pdfStrategy.addProjectItem(createProjectItemFromPdf(pdf));
          message.success("本地 PDF 添加成功");
        } catch (error) {
          console.error("添加本地 PDF 失败:", error);
          message.error("添加本地 PDF 失败");
        }
      } else if (key === "add-remote-pdf-project-item") {
        openModal(ModalKey.RemotePdf);
      } else if (key === "link-pdf-project-item") {
        openSelectPdfModal();
      } else if (key === "add-local-epub-project-item") {
        try {
          const fileInfo = await importLocalBook("epub");
          if (!fileInfo) return;
          const epub = await createEpub({
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            isLocal: true,
            remoteUrl: "",
            tags: [],
            category: "default",
            progressPercentage: 0,
          });
          await epubStrategy.addProjectItem(createProjectItemFromEpub(epub));
          message.success("本地 EPUB 添加成功");
        } catch (error) {
          console.error("添加本地 EPUB 失败:", error);
          message.error("添加本地 EPUB 失败");
        }
      } else if (key === "add-remote-epub-project-item") {
        openModal(ModalKey.RemoteEpub);
      } else if (key === "link-epub-project-item") {
        openSelectEpubModal();
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
              <div className="flex-1 overflow-hidden">
                <div
                  ref={triggerRef}
                  className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-all rounded-md px-2 py-1 flex items-center gap-2 group"
                  onClick={handleToggleProjectDropdown}
                >
                  <span className="truncate">{project.title}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-900 dark:text-gray-100 transition-transform duration-200 ${
                      showProjectDropdown ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </div>
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
                  items: ADD_MENU_ITEMS,
                  onClick: handleAddMenuClick,
                }}
              >
                <div className={styles.icon}>
                  <PlusOutlined />
                </div>
              </Dropdown>
            </div>
          </div>
          <div className={classnames(styles.divider, divideCalass)}></div>
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
                  pdfs={pdfs}
                  epubs={epubs}
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
            open={modalStates.webVideo}
            onCancel={() => closeModal(ModalKey.WebVideo)}
            onConfirm={handleRemoteVideoConfirm}
          />
          <RemotePdfSelectModal
            open={modalStates.remotePdf}
            onCancel={() => closeModal(ModalKey.RemotePdf)}
            onConfirm={handleRemotePdfConfirm}
          />
          <RemoteEpubSelectModal
            open={modalStates.remoteEpub}
            onCancel={() => closeModal(ModalKey.RemoteEpub)}
            onConfirm={handleRemoteEpubConfirm}
          />
          <YoutubeVideoSelectModal
            open={modalStates.youtube}
            onCancel={() => closeModal(ModalKey.Youtube)}
            onConfirm={handleYoutubeConfirm}
          />
          <WebViewSelectModal
            open={modalStates.webview}
            onCancel={() => closeModal(ModalKey.Webview)}
            onSelectFile={handleSelectWebviewFile}
            onConfirm={handleWebviewConfirm}
          />
          <BilibiliVideoSelectModal
            open={modalStates.bilibili}
            onCancel={() => closeModal(ModalKey.Bilibili)}
            onConfirm={handleBilibiliConfirm}
          />

          <NotionVideoSelectModal
            open={modalStates.notion}
            onCancel={() => closeModal(ModalKey.Notion)}
            onConfirm={handleNotionConfirm}
          />

          <SelectPdfModal
            open={selectPdfModalOpen}
            pdfs={pdfs}
            selectedPdfId={selectedPdfId}
            onSelect={onPdfSelect}
            onOk={onSelectPdfOk}
            onCancel={onSelectPdfCancel}
            excludePdfIds={excludePdfIds}
          />

          <SelectEpubModal
            open={selectEpubModalOpen}
            epubs={epubs}
            selectedEpubId={selectedEpubId}
            onSelect={onEpubSelect}
            onOk={onSelectEpubOk}
            onCancel={onSelectEpubCancel}
            excludeEpubIds={excludeEpubIds}
          />

          <NotionSyncModal
            open={modalStates.notionSync}
            token={setting.integration.notion.token}
            onOk={handleNotionSyncModalOk}
            onCancel={() => closeModal(ModalKey.NotionSync)}
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
      <SelectDropDown
        items={allProjects}
        selectedKey={project.id}
        show={showProjectDropdown}
        onClose={() => setShowProjectDropdown(false)}
        onSelect={handleSwitchProject}
        triggerElement={triggerRef.current}
        getKey={(proj) => proj.id}
        renderItem={(proj) => proj.title}
        width={240}
      />
    </>
  );
};

export default Project;
