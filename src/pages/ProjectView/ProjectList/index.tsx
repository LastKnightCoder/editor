import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Dropdown, Empty, MenuProps, App } from "antd";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
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
  VideoNote,
  WhiteBoard,
} from "@/types";
import { useMemoizedFn } from "ahooks";
import SelectCardModal from "@/components/SelectCardModal";
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
  createVideoNote,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";

const Project = () => {
  const { message } = App.useApp();
  const { id } = useParams();
  const { createRootProjectItem } = useProjectsStore((state) => ({
    createRootProjectItem: state.createRootProjectItem,
  }));

  const [project, setProject] = useState<IProject | null>(null);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllWhiteBoards().then((whiteBoards) => {
      setWhiteBoards(whiteBoards);
    });
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
    selectedCards,
    onChange: onCardChange,
    onOk: onCardOk,
    onCancel: onCardCancel,
    selectCardModalOpen,
    openSelectCardModal,
    excludeCardIds,
  } = useAddRefCard(cards, Number(id));

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
        const createProjectItem: CreateProjectItem = {
          title: "新白板",
          content: [],
          whiteBoardData: {
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
          },
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
      } else if (key === "add-video-note-project-item") {
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
        const newVideoNote: Omit<
          VideoNote,
          "id" | "createTime" | "updateTime"
        > = {
          notes: [],
          count: 0,
          metaInfo: {
            type: "local",
            filePath: filePath[0],
          },
        };
        const item = await createVideoNote(newVideoNote);
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }
        const createProjectItem: CreateProjectItem = {
          title: "新视频笔记",
          content: [],
          children: [],
          parents: [],
          projects: [project.id],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
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
          const content = importFromMarkdown(markdown);
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
            {/* {activeProjectItemId && (
              <div className={styles.icon} onClick={onFoldSidebar}>
                <MenuFoldOutlined />
              </div>
            )} */}
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
        <SelectCardModal
          title={"选择关联卡片"}
          selectedCards={selectedCards}
          onChange={onCardChange}
          open={selectCardModalOpen}
          allCards={cards}
          onCancel={onCardCancel}
          onOk={onCardOk}
          excludeCardIds={excludeCardIds}
        />
        <SelectWhiteBoardModal
          title={"选择关联白板"}
          selectedWhiteBoards={selectedWhiteBoards}
          onChange={onWhiteBoardChange}
          open={selectWhiteBoardModalOpen}
          allWhiteBoards={whiteBoards}
          onCancel={onWhiteBoardCancel}
          onOk={onWhiteBoardOk}
          excludeWhiteBoardIds={excludeWhiteBoardIds}
          multiple={multiple}
        />
      </div>
    </ProjectContext.Provider>
  );
};

export default Project;
