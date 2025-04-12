import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Dropdown, Empty, MenuProps, App, Modal, Input } from "antd";
import {
  HomeOutlined,
  PlusOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
} from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import { useNavigate } from "react-router-dom";

import ProjectItem from "./ProjectItem/index.tsx";
import If from "@/components/If";
import For from "@/components/For";

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
import { IExtension } from "@/components/Editor";
import { useMemoizedFn } from "ahooks";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import useAddRefCard from "./ProjectItem/useAddRefCard.ts";
import useAddRefWhiteBoard from "./useAddRefWhiteBoard.ts";
import { ProjectContext } from "../ProjectContext.ts";
import {
  getFileBaseName,
  readTextFile,
  selectFile,
  getProjectById,
  getAllWhiteBoards,
  getAllCards,
  createEmptyVideoNote,
  nodeFetch,
  createWhiteBoardContent,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";

const Project = () => {
  const { message } = App.useApp();
  const { id } = useParams();
  const { createRootProjectItem, activeProjectItemId } = useProjectsStore(
    (state) => ({
      createRootProjectItem: state.createRootProjectItem,
      activeProjectItemId: state.activeProjectItemId,
    }),
  );

  const [project, setProject] = useState<IProject | null>(null);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  const [webVideoModalOpen, setWebVideoModalOpen] = useState(false);
  const [webVideoUrl, setWebVideoUrl] = useState("");

  const [webviewModalOpen, setWebviewModalOpen] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");

  const onFoldSidebar = useMemoizedFn(() => {
    useProjectsStore.setState({
      hideProjectItemList: true,
    });
  });

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllWhiteBoards().then((whiteBoards) => {
      setWhiteBoards(whiteBoards);
    });
  }, []);

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        cardLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
      }) => {
        setExtensions([
          cardLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
        ]);
      },
    );
  }, []);

  const refresh = useMemoizedFn(() => {
    getProjectById(Number(id)).then((res) => {
      setProject(res);
    });
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const navigate = useNavigate();

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

    await onCardOk(newSelectedCards);
    refresh();
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
      await onWhiteBoardOk(whiteBoards);
      refresh();
    },
  );

  const addMenuItems: MenuProps["items"] = [
    {
      key: "add-project-item",
      label: "添加文档",
    },
    {
      key: "add-white-board-project-item",
      label: "添加白板",
    },
    {
      key: "add-video-note-project-item",
      label: "添加视频笔记",
      children: [
        {
          key: "add-local-video-note-project-item",
          label: "本地视频",
        },
        {
          key: "add-remote-video-note-project-item",
          label: "远程视频",
        },
      ],
    },
    {
      key: "add-webview-project-item",
      label: "添加网页",
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
          parents: [],
          projects: [project.id],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        };
        const item = await createRootProjectItem(project.id, createProjectItem);
        if (item) {
          useProjectsStore.setState({
            activeProjectItemId: item.id,
          });
        }
        getProjectById(project.id).then((project) => {
          setProject(project);
        });
      } else if (key === "add-white-board-project-item") {
        const whiteBoardContent = await createWhiteBoardContent({
          name: "新白板",
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
          parents: [],
          projects: [project.id],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.WhiteBoard,
          count: 0,
        };
        const item = await createRootProjectItem(project.id, createProjectItem);
        if (item) {
          useProjectsStore.setState({
            activeProjectItemId: item.id,
          });
        }
        getProjectById(project.id).then((project) => {
          setProject(project);
        });
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
          parents: [],
          projects: [project.id],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };
        const projectItem = await createRootProjectItem(
          project.id,
          createProjectItem,
        );
        if (projectItem) {
          useProjectsStore.setState({
            activeProjectItemId: projectItem.id,
          });
        }
        getProjectById(project.id).then((project) => {
          setProject(project);
        });
      } else if (key === "add-remote-video-note-project-item") {
        setWebVideoModalOpen(true);
      } else if (key === "add-webview-project-item") {
        setWebviewModalOpen(true);
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
          await createRootProjectItem(project.id, {
            title: fileName,
            content,
            children: [],
            parents: [],
            projects: [project.id],
            refType: "",
            refId: 0,
            projectItemType: EProjectItemType.Document,
            count: getContentLength(content),
            whiteBoardContentId: 0,
          });
        }
      }
    },
  );

  if (!project) return null;

  return (
    <ProjectContext.Provider value={{ projectId: project.id }}>
      <div className={styles.list}>
        <div className={styles.header}>
          <div className={styles.title}>
            <HomeOutlined
              onClick={() => {
                useProjectsStore.setState({
                  activeProjectItemId: null,
                  hideProjectItemList: false,
                });
                navigate(`/projects/list`);
              }}
            />
            {project.title}
          </div>
          <div className={styles.icons}>
            {activeProjectItemId && (
              <div className={styles.icon} onClick={onFoldSidebar}>
                <MenuFoldOutlined />
              </div>
            )}
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
          extensions={extensions}
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
        <Modal
          open={webVideoModalOpen}
          onCancel={() => setWebVideoModalOpen(false)}
          onOk={async () => {
            const item = await createEmptyVideoNote({
              type: "remote",
              url: webVideoUrl,
            });
            if (!item) {
              message.error("创建视频笔记失败");
              return;
            }
            const createProjectItem: CreateProjectItem = {
              title: webVideoUrl,
              content: [],
              children: [],
              parents: [],
              projects: [project.id],
              refType: "video-note",
              refId: item.id,
              projectItemType: EProjectItemType.VideoNote,
              count: 0,
              whiteBoardContentId: 0,
            };
            const projectItem = await createRootProjectItem(
              project.id,
              createProjectItem,
            );
            if (projectItem) {
              useProjectsStore.setState({
                activeProjectItemId: projectItem.id,
              });
            }
            getProjectById(project.id).then((project) => {
              setProject(project);
            });
            setWebVideoModalOpen(false);
            setWebVideoUrl("");
          }}
        >
          <Input
            placeholder="请输入网址"
            value={webVideoUrl}
            onChange={(e) => setWebVideoUrl(e.target.value)}
          />
        </Modal>
        <Modal
          open={webviewModalOpen}
          title="添加网页"
          onCancel={() => {
            setWebviewModalOpen(false);
            setWebviewUrl("");
          }}
          onOk={async () => {
            if (!webviewUrl) {
              message.error("请输入网址");
              return;
            }

            const url = webviewUrl.startsWith("http")
              ? webviewUrl
              : `https://${webviewUrl}`;

            let title = url;
            try {
              const response = await nodeFetch(url, {
                method: "GET",
              });

              if (typeof response === "string") {
                const titleMatch = response.match(
                  /<title[^>]*>([^<]+)<\/title>/i,
                );
                if (titleMatch && titleMatch[1]) {
                  title = titleMatch[1].trim();
                }
              }
            } catch (error) {
              console.error("获取网页标题失败:", error);
            }

            const createProjectItem: CreateProjectItem = {
              title: `${title} [${url}]`,
              content: [],
              children: [],
              parents: [],
              projects: [project.id],
              refType: "",
              refId: 0,
              projectItemType: EProjectItemType.WebView,
              count: 0,
              whiteBoardContentId: 0,
            };

            const item = await createRootProjectItem(
              project.id,
              createProjectItem,
            );
            if (item) {
              useProjectsStore.setState({
                activeProjectItemId: item.id,
              });
            }

            refresh();
            setWebviewModalOpen(false);
            setWebviewUrl("");
          }}
        >
          <Input
            placeholder="请输入网址"
            value={webviewUrl}
            onChange={(e) => setWebviewUrl(e.target.value)}
            prefix={<GlobalOutlined />}
            autoFocus
          />
        </Modal>
      </div>
    </ProjectContext.Provider>
  );
};

export default Project;
