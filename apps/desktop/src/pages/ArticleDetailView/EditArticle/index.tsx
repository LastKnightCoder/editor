import { useEffect, useMemo, useRef, memo, useState } from "react";
import { Tooltip, App, Dropdown } from "antd";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useSize,
  useCreation,
  useUnmount,
} from "ahooks";
import { Editor, EditorRef } from "@tau/editor/src";
import {
  IndentDecrease,
  IndentIncrease,
  Code,
  Calendar,
  Pencil,
  BookOpen,
  Presentation,
  ExternalLink,
  CreditCard,
  Mic,
  Maximize2,
} from "lucide-react";
import AddTag from "@/components/AddTag";
import EditText, { EditTextHandle } from "@/components/EditText";
import StatusBar from "@/components/StatusBar";
import EditorSourceValue from "@/components/EditorSourceValue";
import { isValid } from "@/components/WhiteBoard/utils";

import LocalImage from "@/components/LocalImage";
import CoverEditor from "@/components/CoverEditor";
import EditorOutline from "@/components/EditorOutline";
import {
  getInlineElementText,
  formatDate,
  defaultArticleEventBus,
} from "@/utils";

import { HeaderElement } from "@tau/editor/src";

import useEditArticle from "@/hooks/useEditArticle.ts";
import useEditContent from "@/hooks/useEditContent";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";
import useSettingStore from "@/stores/useSettingStore";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";
import { findOneArticle, openArticleInNewWindow } from "@/commands/article";
import {
  attachPodcastToArticle,
  detachPodcastFromArticle,
} from "@/commands/podcast";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import { EditCardContext } from "@/context.ts";
import { produce } from "immer";
import { Descendant } from "slate";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import ErrorBoundary from "@/components/ErrorBoundary";
import PodcastPlayer from "@/components/PodcastPlayer";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";
const extensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];
const OUTLINE_SHOW_WIDTH_THRESHOLD = 1080;

interface IEditArticleProps {
  articleId: number;
  defaultReadonly?: boolean;
}

const EditArticle = memo((props: IEditArticleProps) => {
  const { articleId, defaultReadonly = true } = props;
  const { message } = App.useApp();
  const darkMode = useSettingStore((state) => state.setting.darkMode);

  const {
    initValue,
    editingArticle,
    onContentChange: onContentChangeFromEditArticle,
    onInit,
    onDeleteTag,
    onAddTag,
    onTagsChange,
    onTitleChange,
    saveArticle,
    setEditingArticle,
  } = useEditArticle(articleId);

  const {
    podcastModalOpen,
    openPodcastModal,
    closePodcastModal,
    handlePodcastSuccess,
    handleDeletePodcast,
  } = usePodcastAttachment({
    hostId: articleId,
    currentPodcast: editingArticle?.podcast,
    attachPodcast: attachPodcastToArticle,
    detachPodcast: detachPodcastFromArticle,
    reloadHost: findOneArticle,
    onHostReloaded: setEditingArticle,
    message,
    messages: {
      created: "播客已添加到文章",
    },
  });

  // 闪卡生成
  const flashcard = useFlashcardCreation({
    getContent: () => editingArticle?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: editingArticle?.contentId || 0,
      title: editingArticle?.title || "文章参考",
    }),
  });

  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );
  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [readonly, setReadonly] = useState(defaultReadonly);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const size = useSize(containerRef);
  const { startArticlePresentation } = useArticleManagementStore(
    (state) => ({
      startArticlePresentation: state.startArticlePresentation,
    }),
  );

  const handleStartPresentation = useMemoizedFn(async () => {
    if (articleId) {
      const article = await findOneArticle(articleId);
      if (article) {
        startArticlePresentation(article);
      }
    }
  });

  const handleOpenInNewWindow = useMemoizedFn(() => {
    if (articleId) {
      openArticleInNewWindow(
        useSettingStore.getState().setting.database.active,
        articleId,
      );
    }
  });

  useEffect(() => {
    editorRef.current?.focus();
  }, [defaultReadonly]);

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!editingArticle || !editingArticle.content) return [];
    const headers = editingArticle.content.filter(
      (node) => node.type === "header",
    ) as HeaderElement[];
    return headers.map((header) => ({
      level: header.level,
      title: header.children.map(getInlineElementText).join(""),
    }));
  }, [editingArticle]);

  const statusBarConfigs = useMemo(() => {
    return [
      {
        key: "words-count",
        children: <>字数：{editingArticle?.count}</>,
      },
      {
        key: "readonly",
        children: (
          <>
            {readonly ? (
              <Tooltip title={"编辑"}>
                <Pencil size={14} />
              </Tooltip>
            ) : (
              <Tooltip title={"预览"}>
                <BookOpen size={14} />
              </Tooltip>
            )}
          </>
        ),
        onClick: () => {
          setReadonly(!readonly);
        },
      },
      size && size.width > OUTLINE_SHOW_WIDTH_THRESHOLD && headers.length > 0
        ? {
            key: "outline",
            children: (
              <>
                {showOutline ? (
                  <Tooltip title={"隐藏目录"}>
                    <IndentIncrease size={14} />
                  </Tooltip>
                ) : (
                  <Tooltip title={"显示目录"}>
                    <IndentDecrease size={14} />
                  </Tooltip>
                )}
              </>
            ),
            onClick: () => {
              setShowOutline(!showOutline);
            },
          }
        : undefined,
      {
        key: "source",
        children: (
          <>
            <Tooltip title={"源码"}>
              <Code size={14} />
            </Tooltip>
          </>
        ),
        onClick: () => {
          setEditorSourceValueOpen(true);
        },
      },
      {
        key: "flashcard",
        children: (
          <Dropdown
            menu={{
              items: [
                { key: "manual", label: "手动制卡" },
                { key: "ai", label: "AI 制卡" },
              ],
              onClick: ({ key }) => {
                if (key === "manual") flashcard.openManualFlashcard();
                else flashcard.openAiFlashcard();
              },
            }}
          >
            <CreditCard size={14} />
          </Dropdown>
        ),
      },
      {
        key: "podcast",
        children: (
          <Tooltip title={editingArticle?.podcast ? "编辑播客" : "生成播客"}>
            <Mic size={14} />
          </Tooltip>
        ),
        onClick: openPodcastModal,
      },
      {
        key: "presentation",
        children: (
          <Tooltip title="演示模式">
            <Presentation size={14} />
          </Tooltip>
        ),
        onClick: handleStartPresentation,
      },
      {
        key: "immersive-mode",
        children: (
          <Tooltip title="沉浸模式">
            <Maximize2 size={14} />
          </Tooltip>
        ),
        onClick: () => setImmersiveMode(true),
      },
      {
        key: "open-in-new-window",
        children: (
          <Tooltip title="在新窗口中打开">
          <ExternalLink size={14} />
        </Tooltip>
        ),
        onClick: handleOpenInNewWindow,
      },
    ].filter(isValid);
  }, [
    headers.length,
    readonly,
    showOutline,
    size,
    editingArticle?.count,
    editingArticle?.podcast,
    flashcard,
    handleStartPresentation,
    handleOpenInNewWindow,
    openPodcastModal,
  ]);

  const { run: handleContentResize } = useThrottleFn(
    (entries: ResizeObserverEntry[]) => {
      const { width } = entries[0].contentRect;
      if (headers.length > 0 && width > OUTLINE_SHOW_WIDTH_THRESHOLD) {
        setShowOutline(true);
      } else {
        setShowOutline(false);
      }
    },
    { wait: 500 },
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleContentResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [handleContentResize, headers]);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingArticle?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditArticle(content);
  });

  useEffect(() => {
    if (!articleId) return;

    const unsubscribe = articleEventBus.subscribeToArticleWithId(
      "article:updated",
      articleId,
      (data) => {
        setEditingArticle(data.article);
        titleRef.current?.setValue(data.article.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [articleId, articleEventBus]);

  const handleOnEditorContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!editingArticle) return;
    onContentChange(content);
  });

  const handleOnTitleChange = useMemoizedFn((title: string) => {
    if (!editingArticle) return;
    onTitleChange(title);
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || editingArticle.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || !editingArticle.tags.includes(tag)) return;
    onDeleteTag(tag);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!editingArticle || !newTag || newTag === oldTag) return;
    if (editingArticle.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const newTags = editingArticle.tags.map((tag) =>
      tag === oldTag ? newTag : tag,
    );
    onTagsChange(newTags);
  });

  useRafInterval(async () => {
    if (!editingArticle) return;
    const updatedArticle = await saveArticle();
    if (updatedArticle) {
      articleEventBus.publishArticleEvent("article:updated", updatedArticle);
    }
  }, 500);

  useUnmount(async () => {
    const updatedArticle = await saveArticle();
    if (updatedArticle) {
      articleEventBus.publishArticleEvent("article:updated", updatedArticle);
    }
  });

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  });

  const handleCoverChange = useMemoizedFn((url: string, position: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.bannerBg = url;
      draft.bannerPosition = position;
    });
    setEditingArticle(newEditingArticle);
    articleEventBus.publishArticleEvent("article:updated", newEditingArticle);
  });

  if (!editingArticle) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.editArticleContainer}>
      <div className={styles.cover}>
        <LocalImage
          key={editingArticle.bannerBg}
          url={
            editingArticle.bannerBg ||
            "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
          }
          className={styles.img}
          style={{
            objectPosition: `center ${
              editingArticle.bannerPosition === "top"
                ? "0%"
                : editingArticle.bannerPosition === "bottom"
                  ? "100%"
                  : editingArticle.bannerPosition === "center"
                    ? "center"
                    : editingArticle.bannerPosition // 支持自定义百分比
            }`,
          }}
        />
        <CoverEditor
          coverUrl={editingArticle.bannerBg || ""}
          coverPosition={editingArticle.bannerPosition || "center"}
          onCoverChange={handleCoverChange}
        />
        <EditText
          ref={titleRef}
          key={editingArticle.id}
          className={styles.title}
          defaultValue={editingArticle.title || "默认标题"}
          onChange={handleOnTitleChange}
          onPressEnter={() => {
            editorRef.current?.focus();
          }}
          contentEditable={!readonly}
        />
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <Calendar size={14} />
            <span className={styles.date}>
              创建于{formatDate(editingArticle.create_time, true)}
            </span>
          </div>
          <div className={styles.divider}>|</div>
          <div className={styles.meta}>
            <Calendar size={14} />
            <span className={styles.date}>
              更新于{formatDate(editingArticle.update_time, true)}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.editor}>
          {editingArticle.podcast && (
            <PodcastPlayer
              defaultPodcast={editingArticle.podcast}
              onDelete={handleDeletePodcast}
              onEdit={openPodcastModal}
            />
          )}
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <ErrorBoundary>
              <Editor
                key={editingArticle.id}
                ref={editorRef}
                initValue={initValue}
                onInit={onInit}
                extensions={extensions}
                onChange={handleOnEditorContentChange}
                readonly={readonly}
              />
            </ErrorBoundary>
          </EditCardContext.Provider>
          <AddTag
            style={{ marginTop: 20 }}
            readonly={readonly}
            tags={editingArticle.tags}
            addTag={handleAddTag}
            removeTag={handleDeleteTag}
            editTag={handleEditTag}
          />
        </div>
        <EditorOutline
          className={styles.outline}
          content={editingArticle.content}
          show={showOutline}
          onClickHeader={onClickHeader}
        />
      </div>
      <StatusBar className={styles.statusBar} configs={statusBarConfigs} />
      <EditorSourceValue
        open={editorSourceValueOpen}
        onClose={() => {
          setEditorSourceValueOpen(false);
        }}
        content={editingArticle.content}
      />

      <PodcastGenerationModal
        open={podcastModalOpen}
        cardContent={editingArticle.content}
        initialPodcast={editingArticle.podcast}
        onSuccess={handlePodcastSuccess}
        onCancel={closePodcastModal}
        saveText="保存到文章"
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

      {/* 沉浸模式 */}
      {immersiveMode && (
        <ImmersiveEditorMode
          initValue={editingArticle.content}
          onChange={onContentChange}
          onInit={onInit}
          onExit={() => {
            setImmersiveMode(false);
            // 退出沉浸模式时，同步更新主编辑器内容（Editor 是非受控组件）
            editorRef.current?.setEditorValue(editingArticle.content);
          }}
          wordCount={editingArticle.count}
          readonly={readonly}
          extensions={extensions}
        />
      )}
    </div>
  );
});

export default EditArticle;
