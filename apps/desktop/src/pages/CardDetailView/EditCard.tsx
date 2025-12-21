import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { Descendant } from "slate";
import {
  LinkOutlined,
  ReadOutlined,
  MoreOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { Drawer, Tooltip, Dropdown, MenuProps, App, Button, Input } from "antd";
import {
  LoadingOutlined,
  SendOutlined,
  CloseOutlined,
  CheckOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;
import SVG from "react-inlinesvg";
import { MdOutlineCode } from "react-icons/md";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import { Editor, EditorRef } from "@tau/editor/src";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkGraph from "@/components/LinkGraph";
import PresentationMode from "@/components/PresentationMode";
import StatusBar from "@/components/StatusBar";
import ContentExportModal from "@/components/ContentExportModal";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";

import useEditContent from "@/hooks/useEditContent";
import useContentPolish from "@/hooks/useContentPolish";
import useLLMConfig from "@/hooks/useLLMConfig";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import useAutoTagging from "@/hooks/useAutoTagging";
import ResizablePanel from "@/components/ResizablePanel";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";

import useSettingStore from "@/stores/useSettingStore";
import useShortcutStore from "@/stores/useShortcutStore";

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
import { EditCardContext } from "@/context";
import {
  defaultCardEventBus,
  downloadMarkdown,
  getAllLinkedCards,
  getEditorText,
  getInlineLinks,
  getMarkdown,
  formatDate,
  getContentLength,
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
} from "@/utils";
import { ICard } from "@/types";
import {
  deleteCard,
  getAllCards,
  openCardInNewWindow,
  getAllGlobalTags,
} from "@/commands";
import graphIcon from "@/assets/icons/graph.svg";

import useEditCard from "./useEditCard";
import LinkList from "./LinkList";
import { isValid } from "@/components/WhiteBoard/utils";
import PodcastPlayer from "@/components/PodcastPlayer";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import {
  attachPodcastToCard,
  detachPodcastFromCard,
  getCardById,
} from "@/commands";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";

const minFitViewPadding = [120];
const maxFitViewPadding = [80];

interface IEditCardProps {
  cardId: number;
  defaultReadonly?: boolean;
}

const EditCard = (props: IEditCardProps) => {
  const { cardId, defaultReadonly = false } = props;
  const navigateTo = useTabStore((state) => state.navigateTo);
  const openInNewTab = useTabStore((state) => state.openInNewTab);
  const panes = useTabStore((state) => state.panes);
  const activePaneId = useTabStore((state) => state.activePaneId);
  const { modal, message } = App.useApp();
  const databaseName = useSettingStore(
    (state) => state.setting.database.active,
  );
  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const {
    onInit,
    initValue,
    setInitValue,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
    onTagChange,
    saveCard,
    onAddLinks,
    onRemoveLink,
    setEditingCard,
    prevCard,
  } = useEditCard(cardId);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const editorRef = useRef<EditorRef>(null);
  const polishedEditorRef = useRef<EditorRef>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const [cards, setCards] = useState<ICard[]>([]);
  const [readonly, setReadonly] = useState(defaultReadonly);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const [linkListOpen, setLinkListOpen] = useState(false);
  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [polishMode, setPolishMode] = useState(false);
  const [polishSessionId, setPolishSessionId] = useState(0);
  const [updateTime, setUpdateTime] = useState(editingCard?.update_time || 0);

  // AI 润色配置和 hook
  const { providerConfig, modelConfig } = useLLMConfig("contentPolish");
  const {
    polishedContent,
    polishPending,
    setPolishedContent,
    isPolishing,
    error: polishError,
    startPolish,
    continuePolish,
    stopPolish,
    reset: resetPolish,
  } = useContentPolish(providerConfig, modelConfig);

  const [polishInstruction, setPolishInstruction] = useState("");

  // AI 自动标签配置和 hook
  const { providerConfig: tagProviderConfig, modelConfig: tagModelConfig } =
    useLLMConfig("autoTagging");
  const { isGenerating: isTagGenerating, generateTags } = useAutoTagging(
    tagProviderConfig,
    tagModelConfig,
  );

  // 闪卡生成
  const flashcard = useFlashcardCreation({
    getContent: () => editingCard?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: editingCard?.contentId || 0,
      title: getEditorText(editingCard?.content || [], 20) || "卡片参考",
    }),
  });

  const {
    findShortcut,
    createShortcut,
    deleteShortcut,
    loaded,
    loadShortcuts,
    items: shortcuts,
  } = useShortcutStore();

  // 加载快捷方式
  useEffect(() => {
    if (!loaded) {
      loadShortcuts();
    }
  }, [loaded, loadShortcuts]);

  // 检查是否已添加快捷方式
  const isShortcut = useMemo(() => {
    if (!editingCard) return null;
    return findShortcut({
      resourceType: "card",
      scope: "item",
      resourceId: editingCard.id,
    });
  }, [findShortcut, editingCard, shortcuts]);

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditCard(content);
    setUpdateTime(Date.now());
  });

  useEffect(() => {
    if (editingCard?.update_time) {
      setUpdateTime(editingCard?.update_time);
    }
  }, [editingCard?.update_time]);

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      modal.confirm({
        title: "删除卡片",
        content: "确定要删除该卡片吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          await deleteCard(cardId);
          navigateTo(TabType.CardList);
        },
      });
    } catch (error) {
      console.error("删除卡片失败", error);
    }
  });

  const {
    podcastModalOpen,
    openPodcastModal,
    closePodcastModal,
    handlePodcastSuccess,
    handleDeletePodcast,
  } = usePodcastAttachment({
    hostId: cardId,
    currentPodcast: editingCard?.podcast,
    attachPodcast: attachPodcastToCard,
    detachPodcast: detachPodcastFromCard,
    reloadHost: getCardById,
    onHostReloaded: setEditingCard,
    message,
    messages: {
      created: "播客已添加到卡片",
    },
  });

  const handleApplyPolish = useMemoizedFn(() => {
    // 从右侧编辑器获取最新的内容
    const currentPolishedContent = polishedEditorRef.current
      ? (polishedEditorRef.current.getEditor().children as Descendant[])
      : polishedContent;

    if (currentPolishedContent && editingCard) {
      // 同步更新 editingCard.content 和 initValue
      setEditingCard({
        ...editingCard,
        content: currentPolishedContent,
        count: getContentLength(currentPolishedContent),
      });
      setInitValue(currentPolishedContent);
      // 手动触发保存到数据库
      throttleHandleEditorContentChange(currentPolishedContent);
      throttleHandleEditorContentChange.flush();
      // 提示用户
      message.success("已应用润色内容");
      // 退出润色模式（会触发 Editor 重新挂载，使用最新的 initValue）
      setPolishMode(false);
      stopPolish();
      resetPolish();
      setPolishInstruction("");
    }
  });

  const handleCancelPolish = useMemoizedFn(() => {
    // 退出润色模式前，获取左侧编辑器的最新内容并同步更新
    if (editorRef.current && editingCard) {
      const currentContent = editorRef.current.getEditor()
        .children as Descendant[];
      setEditingCard({
        ...editingCard,
        content: currentContent,
        count: getContentLength(currentContent),
      });
      setInitValue(currentContent);
      // 保存到数据库
      throttleHandleEditorContentChange(currentContent);
      throttleHandleEditorContentChange.flush();
    }

    setPolishMode(false);
    stopPolish();
    resetPolish();
    setPolishInstruction("");
  });

  const handleSendInstruction = useMemoizedFn(() => {
    if (!polishInstruction.trim()) {
      message.warning("请输入微调指令");
      return;
    }
    // 增加 session ID 以强制重新挂载编辑器
    setPolishSessionId((prev) => prev + 1);
    continuePolish(polishInstruction.trim());
    setPolishInstruction("");
  });

  // 当润色内容更新时，实时更新右侧编辑器
  useEffect(() => {
    if (polishedContent && polishedEditorRef.current) {
      polishedEditorRef.current.setEditorValue(polishedContent);
    }
  }, [polishedContent]);

  useEffect(() => {
    getAllCards().then((res) => {
      setCards(res);
    });
  }, []);

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  const allLinkedCards = useMemo(() => {
    if (!editingCard) return [];
    const links = getAllLinkedCards(editingCard, cards);
    return links;
  }, [cards, editingCard]);

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!editingCard || !newTag || newTag === oldTag) return;
    if (editingCard.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const newTags = editingCard.tags.map((tag) =>
      tag === oldTag ? newTag : tag,
    );
    onTagChange(newTags);
  });

  // AI 自动打标签
  const handleAiTagClick = useMemoizedFn(async () => {
    if (!editingCard || isTagGenerating) return;

    if (!tagProviderConfig || !tagModelConfig) {
      message.error("请先在设置中配置自动打标签的模型");
      return;
    }

    try {
      // 获取全局标签
      const allTags = await getAllGlobalTags();
      console.log("[AutoTagging] 获取到全局标签数量:", allTags.length);
      console.log("[AutoTagging] 全局标签:", allTags);

      // 生成新标签
      const newTags = await generateTags(
        editingCard.content,
        editingCard.tags,
        allTags,
      );

      if (newTags.length === 0) {
        message.info("未能生成新标签，当前内容可能已有足够的标签覆盖");
        return;
      }

      // 一次性追加所有新标签（避免 React 状态更新的异步问题）
      const mergedTags = [...editingCard.tags, ...newTags];
      onTagChange(mergedTags);

      message.success(`已添加 ${newTags.length} 个新标签`);
    } catch (error) {
      console.error("AI 标签生成失败:", error);
      message.error("标签生成失败，请重试");
    }
  });

  useRafInterval(async () => {
    if (!readonly) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    if (!readonly) {
      throttleHandleEditorContentChange.flush();
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        setEditingCard(data.card);
        prevCard.current = data.card;
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId, cardEventBus, setEditingCard]);

  const statusBarConfigs = useMemo(() => {
    return [
      {
        key: "words-count",
        children: <>字数：{editingCard?.count}</>,
      },
      {
        key: "readonly",
        children: (
          <>
            {readonly ? (
              <Tooltip title={"编辑"}>
                <span>
                  <EditOutlined />
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={"预览"}>
                <span>
                  <ReadOutlined />
                </span>
              </Tooltip>
            )}
          </>
        ),
        onClick: () => {
          setReadonly(!readonly);
        },
      },
      {
        key: "link-list",
        children: (
          <>
            <Tooltip title={"关联列表"}>
              <span>
                <LinkOutlined />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkListOpen(true);
        },
      },
      {
        key: "link-graph",
        children: (
          <>
            <Tooltip title={"关联图谱"}>
              <span>
                <SVG src={graphIcon} style={{ fill: "currentcolor" }} />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkGraphOpen(true);
        },
      },
      {
        key: "source",
        children: (
          <>
            <Tooltip title={"源码"}>
              <span>
                <MdOutlineCode className="text-base" />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setEditorSourceValueOpen(true);
        },
      },
    ].filter(isValid);
  }, [readonly, editingCard?.count]);

  const handleClickLinkCard = useMemoizedFn((card: ICard) => {
    // 确定在哪个 pane 中打开 - 尝试在另一个 pane 中打开
    let targetPaneId: string | undefined;
    if (panes.length > 1) {
      const otherPane = panes.find((p) => p.id !== activePaneId);
      targetPaneId = otherPane?.id;
    }

    openInNewTab(
      TabType.CardDetail,
      { id: card.id },
      targetPaneId,
      getEditorText(card.content, 10),
    );
  });

  const handleMoreMenuClick = useMemoizedFn(
    async ({ key }: { key: string }) => {
      if (!editingCard) return;

      if (key === "ai-polish") {
        if (!providerConfig || !modelConfig) {
          message.error("请先在设置中配置内容润色的模型");
          return;
        }
        setPolishMode(true);
        setPolishSessionId((prev) => prev + 1);
        startPolish(editingCard.content);
      } else if (key === "presentation") {
        setPresentationMode(true);
      } else if (key === "immersive-mode") {
        setImmersiveMode(true);
      } else if (key === "generate-podcast") {
        openPodcastModal();
      } else if (key === "open-window") {
        openCardInNewWindow(databaseName, editingCard.id);
        navigateTo(TabType.CardList);
      } else if (key === "open-sidebar") {
        // 确定在哪个 pane 中打开 - 尝试在另一个 pane 中打开
        let targetPaneId: string | undefined;
        if (panes.length > 1) {
          const otherPane = panes.find((p) => p.id !== activePaneId);
          targetPaneId = otherPane?.id;
        }

        openInNewTab(
          TabType.CardDetail,
          { id: editingCard.id },
          targetPaneId,
          getEditorText(editingCard.content, 10),
        );
        navigateTo(TabType.CardList);
      } else if (key === "toggle-shortcut") {
        try {
          if (isShortcut) {
            await deleteShortcut(isShortcut.id);
            message.success("已取消快捷方式");
          } else {
            const title = getEditorText(editingCard.content, 10);
            await createShortcut({
              resourceType: "card",
              scope: "item",
              resourceId: editingCard.id,
              title,
            });
            message.success("已添加到快捷方式");
          }
        } catch (error) {
          console.error("操作快捷方式失败:", error);
          message.error("操作失败");
        }
      } else if (key === "copy-markdown") {
        await copyMarkdownToClipboard(editingCard.content, message);
      } else if (key === "copy-wechat") {
        await copyWechatHtmlToClipboard(editingCard.content, message);
      } else if (key === "export-markdown") {
        const markdown = getMarkdown(editingCard.content);
        downloadMarkdown(markdown, String(editingCard.id));
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "delete-card") {
        handleDeleteCard(editingCard.id);
      } else if (key === "manual-flashcard") {
        flashcard.openManualFlashcard();
      } else if (key === "ai-flashcard") {
        flashcard.openAiFlashcard();
      }
    },
  );

  const moreMenuItems: MenuProps["items"] = useMemo(() => {
    return [
      {
        key: "ai-polish",
        label: "AI 润色",
      },
      {
        key: "create-flashcard",
        label: "制作闪卡",
        children: [
          {
            key: "manual-flashcard",
            label: "手动制卡",
          },
          {
            key: "ai-flashcard",
            label: "AI 制卡",
          },
        ],
      },
      {
        key: "presentation",
        label: "演示模式",
      },
      {
        key: "immersive-mode",
        label: "沉浸模式",
      },
      {
        key: "generate-podcast",
        label: "生成播客",
      },
      {
        key: "open-window",
        label: "窗口打开",
      },
      {
        key: "open-sidebar",
        label: "新Tab打开",
      },
      {
        key: "toggle-shortcut",
        label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
      },
      {
        key: "copy",
        label: "复制卡片",
        children: [
          {
            key: "copy-markdown",
            label: "Markdown",
          },
          {
            key: "copy-wechat",
            label: "微信公众号",
          },
        ],
      },
      {
        key: "export",
        label: "导出卡片",
        children: [
          {
            key: "export-markdown",
            label: "Markdown",
          },
          {
            key: "export-image",
            label: "图片",
          },
        ],
      },
      {
        key: "delete-card",
        label: "删除卡片",
      },
    ];
  }, [isShortcut]);

  const handleKeyDown = useMemoizedFn(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendInstruction();
      }
    },
  );

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        Loading...
      </div>
    );
  }

  if (!editingCard) {
    return null;
  }

  return (
    <EditCardContext.Provider
      value={{
        cardId: editingCard.id,
      }}
    >
      <div className="relative mx-auto w-full h-full flex flex-col">
        {!polishMode && (
          <div className="mb-6 flex opacity-80 text-sm shrink-0 mx-auto w-full max-w-[min(100%,800px)] px-5 box-border justify-between">
            <div className="flex-1 flex gap-2.5">
              <div>
                <span>创建于 {formatDate(editingCard.create_time, true)}</span>
              </div>
              <div>
                <span>
                  最后修改于{" "}
                  {formatDate(updateTime || editingCard.update_time, true)}
                </span>
              </div>
            </div>
            <div className="flex items-center cursor-pointer ml-auto hover:opacity-70">
              <Dropdown
                menu={{ items: moreMenuItems, onClick: handleMoreMenuClick }}
              >
                <MoreOutlined />
              </Dropdown>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 w-full overflow-auto">
          {polishMode ? (
            // AI 润色模式：卡片式布局
            <div className="w-full h-full flex flex-col items-center px-6 py-4">
              <div className="w-full max-w-[1600px] h-full flex flex-col">
                <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] overflow-hidden">
                  <ResizablePanel
                    leftPanel={
                      <div className="h-full flex flex-col bg-white dark:bg-gray-800 p-6">
                        <div className="mb-3 font-semibold text-base text-gray-700 dark:text-gray-300">
                          原内容
                        </div>
                        <div className="flex-1 overflow-auto">
                          <ErrorBoundary>
                            <Editor
                              key={`polish-${editingCard.id}`}
                              ref={editorRef}
                              onInit={onInit}
                              initValue={initValue}
                              onChange={onContentChange}
                              extensions={customExtensions}
                              readonly={false}
                            />
                          </ErrorBoundary>
                        </div>
                      </div>
                    }
                    rightPanel={
                      <div className="h-full flex flex-col bg-linear-to-br from-blue-50/80 to-indigo-50/60 dark:from-blue-900/30 dark:to-indigo-900/20 p-6">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-semibold text-base text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <span className="animate-pulse">✨</span>
                            AI 润色结果
                          </div>
                          {isPolishing && (
                            <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
                              <LoadingOutlined style={{ fontSize: 14 }} />
                              <span className="text-[13px]">
                                {polishPending
                                  ? "等待模型输出..."
                                  : "正在润色中..."}
                              </span>
                            </div>
                          )}
                          {!isPolishing && polishedContent && (
                            <div className="flex items-center gap-1.5">
                              {/* 取消按钮 */}
                              <div
                                onClick={handleCancelPolish}
                                className="h-8 w-8 flex items-center justify-center cursor-pointer rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-100/80 dark:hover:bg-gray-700/30 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-150"
                                title="放弃润色"
                              >
                                <CloseOutlined className="text-[14px]" />
                              </div>

                              {/* 应用润色按钮 */}
                              <div
                                onClick={handleApplyPolish}
                                className="h-8 px-3 flex items-center gap-1.5 cursor-pointer rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 transition-all duration-150 font-medium"
                              >
                                <CheckOutlined className="text-[12px]" />
                                <span className="text-[14px]">应用</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {polishError && (
                          <div className="mb-2 text-red-500 text-sm px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            润色失败: {polishError.message}
                          </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto">
                          {polishPending && (
                            <div className="h-full flex items-center justify-center text-gray-400">
                              <LoadingOutlined style={{ fontSize: 24 }} />
                            </div>
                          )}
                          {!polishPending && polishedContent && (
                            <ErrorBoundary>
                              <Editor
                                key={`polished-${editingCard.id}-${polishSessionId}`}
                                ref={polishedEditorRef}
                                initValue={
                                  polishedContent || [
                                    {
                                      type: "paragraph",
                                      children: [
                                        { type: "formatted", text: "" },
                                      ],
                                    },
                                  ]
                                }
                                extensions={customExtensions}
                                readonly={isPolishing}
                                onChange={(value) => {
                                  if (!isPolishing) {
                                    setPolishedContent(value);
                                  }
                                }}
                              />
                            </ErrorBoundary>
                          )}
                        </div>

                        {!isPolishing && polishedContent && (
                          <div className="mt-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                            <div className="flex py-3 px-4">
                              <TextArea
                                value={polishInstruction}
                                onChange={(e) =>
                                  setPolishInstruction(e.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                placeholder="继续对话微调（按 Enter 发送）..."
                                autoSize={{ minRows: 1, maxRows: 4 }}
                                disabled={isPolishing}
                                className="w-full resize-none border-none focus:ring-0 bg-transparent text-base px-0!"
                                variant="borderless"
                              />
                              <Button
                                type="text"
                                icon={<SendOutlined />}
                                onClick={handleSendInstruction}
                                disabled={
                                  isPolishing || !polishInstruction.trim()
                                }
                                className="ml-2"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full px-5 box-border mx-auto max-w-[min(100%,800px)]">
              {editingCard.podcast && (
                <PodcastPlayer
                  defaultPodcast={editingCard.podcast}
                  onDelete={handleDeletePodcast}
                  onEdit={openPodcastModal}
                />
              )}
              <ErrorBoundary>
                <Editor
                  key={`normal-${editingCard.id}`}
                  ref={editorRef}
                  onInit={onInit}
                  initValue={initValue}
                  onChange={onContentChange}
                  extensions={customExtensions}
                  readonly={readonly}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
        {!polishMode && (
          <div className="mt-4 shrink-0 mx-auto w-full max-w-[min(100%,800px)] px-5 box-border">
            <AddTag
              tags={editingCard.tags}
              addTag={handleAddTag}
              removeTag={handleDeleteTag}
              editTag={handleEditTag}
              readonly={readonly}
              showAiButton={!readonly}
              onAiTagClick={handleAiTagClick}
              isAiGenerating={isTagGenerating}
              onReorder={onTagChange}
            />
          </div>
        )}

        {!polishMode && (
          <StatusBar
            className="h-[30px] flex items-center justify-between absolute bottom-5 right-9"
            configs={statusBarConfigs}
          />
        )}
        <Drawer
          title="关联列表"
          open={linkListOpen}
          size={500}
          onClose={() => setLinkListOpen(false)}
        >
          <LinkList
            onClickLinkCard={handleClickLinkCard}
            addLinks={onAddLinks}
            removeLink={onRemoveLink}
            editingCard={editingCard}
            readonly={readonly}
          />
        </Drawer>
        <Drawer
          title="关联图谱"
          open={linkGraphOpen}
          size={500}
          onClose={() => setLinkGraphOpen(false)}
        >
          <LinkGraph
            key={editingCard.id}
            initCards={allLinkedCards}
            currentCardIds={[editingCard.id]}
            cardWidth={360}
            getCardLinks={getCardLinks}
            fitView={true}
            fitViewPadding={
              allLinkedCards.length > 20 ? maxFitViewPadding : minFitViewPadding
            }
            style={{
              height: "calc(100vh - 105px)",
            }}
            onClickCard={handleClickLinkCard}
          />
        </Drawer>
        <EditorSourceValue
          open={editorSourceValueOpen}
          onClose={() => setEditorSourceValueOpen(false)}
          content={editingCard.content}
        />
        {presentationMode && (
          <PresentationMode
            content={editingCard.content}
            onExit={() => {
              setPresentationMode(false);
            }}
          />
        )}
        {immersiveMode && (
          <ImmersiveEditorMode
            initValue={editingCard.content}
            onChange={onContentChange}
            onInit={onInit}
            onExit={() => {
              setImmersiveMode(false);
              // 退出沉浸模式时，同步更新主编辑器内容（Editor 是非受控组件）
              editorRef.current?.setEditorValue(editingCard.content);
            }}
            wordCount={editingCard.count}
            readonly={readonly}
            extensions={customExtensions}
          />
        )}
        <ContentExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          content={editingCard.content}
        />

        <PodcastGenerationModal
          open={podcastModalOpen}
          cardContent={editingCard.content}
          initialPodcast={editingCard.podcast}
          onSuccess={handlePodcastSuccess}
          onCancel={closePodcastModal}
          saveText="保存到卡片"
        />

        {/* 卡组选择弹窗 */}
        <DeckSelectorModal
          open={flashcard.deckSelectorOpen}
          onCancel={flashcard.closeDeckSelector}
          onSelect={flashcard.handleDeckSelect}
          title={
            flashcard.deckSelectorMode === "manual"
              ? "选择卡组 - 手动制卡"
              : "选择卡组 - AI 制卡"
          }
        />

        {/* 手动制卡编辑器 */}
        {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
          <FlashcardEditor
            open={flashcard.flashcardEditorOpen}
            mode="create"
            activeDeckId={flashcard.selectedDeck.id}
            onClose={flashcard.closeFlashcardEditor}
            isDark={darkMode}
            initialReferences={[flashcard.getReference()]}
          />
        )}

        {/* AI 生成闪卡弹窗 */}
        <FlashcardGenerationModal
          open={flashcard.aiGenerationModalOpen}
          onCancel={flashcard.handleCancelAiGeneration}
          isGenerating={flashcard.isGenerating}
          isPending={flashcard.isGenerationPending}
          error={flashcard.generationError}
          generatedCards={flashcard.generatedCards}
          selectedDeck={flashcard.selectedDeck}
          onToggleCard={flashcard.toggleCardSelection}
          onSelectAll={flashcard.selectAll}
          onDeselectAll={flashcard.deselectAll}
          onConfirm={flashcard.handleConfirmAiGeneration}
          onChangeDeck={flashcard.changeDeck}
          onEditCard={flashcard.handleEditGeneratedCard}
        />

        {/* 编辑 AI 生成的闪卡弹窗 */}
        <GeneratedFlashcardEditModal
          open={flashcard.generatedCardEditModalOpen}
          card={flashcard.editingGeneratedCard}
          onSave={flashcard.handleSaveGeneratedCard}
          onCancel={flashcard.closeGeneratedCardEditModal}
          isDark={darkMode}
        />
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
