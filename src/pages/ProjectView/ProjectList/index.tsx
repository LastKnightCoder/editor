import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Dropdown,
  Empty,
  MenuProps,
  App,
  Modal,
  Input,
  Select,
  Tag,
} from "antd";
import {
  HomeOutlined,
  PlusOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  LoadingOutlined,
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
  addRootProjectItem,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
import {
  isBilibiliUrl,
  quickCheckBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
  BilibiliVideoQuality,
} from "@/utils/bilibili";
import useSettingStore from "@/stores/useSettingStore";

const Project = () => {
  const { message } = App.useApp();
  const { id } = useParams();
  const { activeProjectItemId } = useProjectsStore((state) => ({
    activeProjectItemId: state.activeProjectItemId,
  }));
  const { setting } = useSettingStore((state) => ({ setting: state.setting }));

  const [project, setProject] = useState<IProject | null>(null);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);

  const [webVideoModalOpen, setWebVideoModalOpen] = useState(false);
  const [webVideoUrl, setWebVideoUrl] = useState("");

  const [webviewModalOpen, setWebviewModalOpen] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");

  const [bilibiliModalOpen, setBilibiliModalOpen] = useState(false);
  const [bilibiliUrl, setBilibiliUrl] = useState("");
  const [bilibiliLoading, setBilibiliLoading] = useState(false);
  const [bilibiliQualityOptions, setBilibiliQualityOptions] = useState<
    Array<{
      label: string;
      value: number;
      needLogin?: boolean;
      needVip?: boolean;
    }>
  >([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(
    BilibiliVideoQuality.HD_1080P,
  ); // 默认 1080P
  const [qualityLoading, setQualityLoading] = useState(false);

  const onFoldSidebar = useMemoizedFn(() => {
    useProjectsStore.setState({
      hideProjectItemList: true,
    });
  });

  // 获取 Bilibili 视频的可用清晰度选项
  const fetchBilibiliQualityOptions = useMemoizedFn(async (url: string) => {
    if (!url.trim() || !isBilibiliUrl(url)) {
      setBilibiliQualityOptions([]);
      return;
    }

    // 如果已经在加载，则不重复请求
    if (qualityLoading) return;

    setQualityLoading(true);
    try {
      const credentials = setting.integration.bilibili.credentials;

      // 先获取视频信息以获得 cid
      const videoInfo = await getVideoInfoByUrl(url, credentials);

      // 获取可用清晰度信息
      const qualityInfo = await getQualityInfo(
        videoInfo.cid,
        videoInfo.bvid,
        credentials,
      );

      // 转换为选项格式
      const options = getQualityOptions(qualityInfo.accept_quality);
      setBilibiliQualityOptions(options);

      // 设置默认选择的清晰度
      const hasLogin = !!credentials.SESSDATA;
      const hasVip =
        !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;

      let defaultQuality: number;
      if (hasVip) {
        defaultQuality = options[0]?.value || BilibiliVideoQuality.HD_1080P;
      } else if (hasLogin) {
        const maxQuality = Math.max(
          ...options
            .filter((opt) => opt.value <= BilibiliVideoQuality.HD_1080P)
            .map((opt) => opt.value),
        );
        defaultQuality = maxQuality || BilibiliVideoQuality.HD_720P;
      } else {
        const maxQuality = Math.max(
          ...options
            .filter((opt) => opt.value <= BilibiliVideoQuality.HD_720P)
            .map((opt) => opt.value),
        );
        defaultQuality = maxQuality || BilibiliVideoQuality.CLEAR_480P;
      }

      setSelectedQuality(defaultQuality);
    } catch (error) {
      console.error("获取清晰度选项失败:", error);
      setBilibiliQualityOptions([
        { label: "480P 清晰", value: BilibiliVideoQuality.CLEAR_480P },
        { label: "720P 高清", value: BilibiliVideoQuality.HD_720P },
        {
          label: "1080P 高清",
          value: BilibiliVideoQuality.HD_1080P,
          needLogin: true,
        },
      ]);
      setSelectedQuality(BilibiliVideoQuality.HD_720P);
    } finally {
      setQualityLoading(false);
    }
  });

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllWhiteBoards().then((whiteBoards) => {
      setWhiteBoards(whiteBoards);
    });
  }, []);

  const extensions = useDynamicExtensions();

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

  // 防抖获取质量选项
  const [debounceTimeoutId, setDebounceTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  // 处理输入变化的防抖逻辑
  const handleBilibiliUrlChange = useMemoizedFn((url: string) => {
    setBilibiliUrl(url);

    // 清除之前的防抖定时器
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId);
    }

    if (!url.trim()) {
      setBilibiliQualityOptions([]);
      return;
    }

    // 设置新的防抖定时器
    const timeoutId = setTimeout(() => {
      if (isBilibiliUrl(url)) {
        fetchBilibiliQualityOptions(url);
      }
    }, 800); // 防抖：800ms 后执行

    setDebounceTimeoutId(timeoutId);
  });

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId);
      }
    };
  }, [debounceTimeoutId]);

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
          useProjectsStore.setState({
            activeProjectItemId: item.id,
          });
        }
        setProject(newProject);
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
          useProjectsStore.setState({
            activeProjectItemId: item.id,
          });
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
          useProjectsStore.setState({
            activeProjectItemId: projectItem.id,
          });
        }
        setProject(newProject);
      } else if (key === "add-remote-video-note-project-item") {
        setWebVideoModalOpen(true);
      } else if (key === "add-bilibili-video-note-project-item") {
        setBilibiliModalOpen(true);
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
          const content = importFromMarkdown(markdown, [
            "yaml",
            "footnoteDefinition",
            "footnoteReference",
          ]);
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
            useProjectsStore.setState({
              activeProjectItemId: item.id,
            });
          }
          setProject(newProject);
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
              useProjectsStore.setState({
                activeProjectItemId: projectItem.id,
              });
            }
            setProject(newProject);
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
              refType: "",
              refId: 0,
              projectItemType: EProjectItemType.WebView,
              count: 0,
              whiteBoardContentId: 0,
            };

            const [newProject, item] = await addRootProjectItem(
              project.id,
              createProjectItem,
            );
            if (item) {
              useProjectsStore.setState({
                activeProjectItemId: item.id,
              });
            }
            setProject(newProject);

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
        <Modal
          open={bilibiliModalOpen}
          title="添加 Bilibili 视频笔记"
          onCancel={() => {
            setBilibiliModalOpen(false);
            setBilibiliUrl("");
            setBilibiliLoading(false);
            setBilibiliQualityOptions([]);
            setSelectedQuality(BilibiliVideoQuality.HD_1080P);
            setQualityLoading(false);
            // 清理防抖定时器
            if (debounceTimeoutId) {
              clearTimeout(debounceTimeoutId);
              setDebounceTimeoutId(null);
            }
          }}
          confirmLoading={bilibiliLoading}
          onOk={async () => {
            if (!bilibiliUrl.trim()) {
              message.error("请输入 Bilibili 视频链接");
              return;
            }

            if (!isBilibiliUrl(bilibiliUrl)) {
              message.error("请输入有效的 Bilibili 视频链接");
              return;
            }

            setBilibiliLoading(true);

            try {
              // 快速检查 URL 有效性
              const urlCheck = await quickCheckBilibiliUrl(bilibiliUrl);
              if (!urlCheck.isValid) {
                message.error(urlCheck.error || "无效的 Bilibili 链接");
                return;
              }

              const playerInfo = await getVideoInfoByUrl(bilibiliUrl);

              // 创建 Bilibili 视频笔记
              const item = await createEmptyVideoNote({
                type: "bilibili",
                bvid: playerInfo.bvid || "",
                cid: playerInfo.cid || "", // 将在播放时获取
                quality: selectedQuality, // 用户选择的清晰度
              });

              if (!item) {
                message.error("创建视频笔记失败");
                return;
              }

              const createProjectItem: CreateProjectItem = {
                title: urlCheck.title || `Bilibili 视频 - ${urlCheck.bvid}`,
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
                useProjectsStore.setState({
                  activeProjectItemId: projectItem.id,
                });
              }

              setProject(newProject);
              setBilibiliModalOpen(false);
              setBilibiliUrl("");
              setBilibiliQualityOptions([]);
              setSelectedQuality(BilibiliVideoQuality.HD_1080P);
              // 清理防抖定时器
              if (debounceTimeoutId) {
                clearTimeout(debounceTimeoutId);
                setDebounceTimeoutId(null);
              }
              message.success("Bilibili 视频笔记添加成功！");
            } catch (error) {
              console.error("添加 Bilibili 视频失败:", error);
              message.error("添加 Bilibili 视频失败，请检查链接是否正确");
            } finally {
              setBilibiliLoading(false);
            }
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="请输入 Bilibili 视频链接 (如: https://www.bilibili.com/video/BV...)"
              value={bilibiliUrl}
              onChange={(e) => handleBilibiliUrlChange(e.target.value)}
              suffix={qualityLoading ? <LoadingOutlined /> : undefined}
              autoFocus
            />
            {qualityLoading && (
              <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>
                正在获取可用清晰度选项...
              </div>
            )}
          </div>

          {/* 清晰度选择器 */}
          {bilibiliQualityOptions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                选择清晰度:
                {qualityLoading && (
                  <LoadingOutlined style={{ marginLeft: 8 }} />
                )}
              </div>
              <Select
                value={selectedQuality}
                onChange={setSelectedQuality}
                style={{ width: "100%" }}
                placeholder="选择清晰度"
                loading={qualityLoading}
                disabled={qualityLoading}
              >
                {bilibiliQualityOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{option.label}</span>
                      <div>
                        {option.needVip && <Tag color="gold">大会员</Tag>}
                        {option.needLogin && !option.needVip && (
                          <Tag color="blue">需登录</Tag>
                        )}
                      </div>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>
                * 高清晰度可能需要登录或大会员权限
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            <p>支持的链接格式：</p>
            <ul style={{ marginBottom: 0, paddingLeft: 16 }}>
              <li>普通视频: https://www.bilibili.com/video/BV...</li>
              <li>番剧: https://www.bilibili.com/bangumi/play/ss...</li>
              <li>分集: https://www.bilibili.com/bangumi/play/ep...</li>
            </ul>
          </div>
        </Modal>
      </div>
    </ProjectContext.Provider>
  );
};

export default Project;
