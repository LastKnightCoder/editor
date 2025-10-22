import { useEffect, useRef, useMemo } from "react";
import { Descendant } from "slate";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import useEdit from "./useEdit";
import { useShallow } from "zustand/react/shallow";
import useProjectsStore from "@/stores/useProjectsStore";

import { formatDate, defaultProjectItemEventBus } from "@/utils";
import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";
import useEditContent from "@/hooks/useEditContent";
import NotionSyncStatus from "@/components/NotionSyncStatus";
import NotionConflictModal from "@/components/NotionConflictModal";
import { notionCompatibleExtensions } from "@/components/Editor/extensions/notion-compatible";
import { useNotionSyncIntegration } from "./useNotionSyncIntegration";

import styles from "./index.module.less";

const defaultExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
  questionCardExtension,
];

const EditProjectItem = (props: { projectItemId: number }) => {
  const { projectItemId } = props;
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const {
    projectItem,
    onInit,
    onTitleChange,
    onContentChange: onContentChangeFromEditProjectItem,
    saveProjectItem,
    setProjectItem,
  } = useEdit(projectItemId);

  // Notion 同步集成
  const {
    notionSync,
    isNotionDocument,
    syncStatus,
    conflictModalOpen,
    localContent,
    notionContent,
    handleManualSync,
    handleSyncFromNotion,
    handleDisconnect,
    handleOpenInNotion,
    handleUseLocalContent,
    handleUseNotionContent,
    handleCancelConflictModal,
    useNotionExtensions,
  } = useNotionSyncIntegration(projectItem, setProjectItem, (content) =>
    editorRef.current?.setEditorValue(content),
  );

  // 根据是否是 Notion 文档决定使用的扩展集
  const extensions = useMemo(() => {
    if (isNotionDocument && useNotionExtensions) {
      // 双向编辑模式：使用 Notion 兼容扩展
      return notionCompatibleExtensions;
    }
    // 普通文档或 JSON 模式：使用默认扩展（支持所有功能）
    return defaultExtensions;
  }, [isNotionDocument, useNotionExtensions]);

  const { throttleHandleEditorContentChange } = useEditContent(
    projectItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const { showOutline, readonly } = useProjectsStore(
    useShallow((state) => ({
      showOutline: state.showOutline,
      readonly: state.readonly,
    })),
  );

  useRafInterval(async () => {
    if (readonly) return;
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  }, 1000);

  useUnmount(async () => {
    if (readonly) return;
    throttleHandleEditorContentChange.flush();
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    onContentChangeFromEditProjectItem(content);
  });

  const uploadResource = useUploadResource();

  const onClickHeader = useMemoizedFn((index: number) => {
    editorRef.current?.scrollHeaderIntoView(index);
  });

  const onPressEnter = useMemoizedFn(async () => {
    titleRef.current?.blur();
    editorRef.current?.focus();
    // 保存项目
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  });

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      projectItemId,
      (data) => {
        setProjectItem(data.projectItem);
        if (!projectItem) return;
        if (data.projectItem.title !== projectItem?.title) {
          titleRef.current?.setValue(data.projectItem.title);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemId, projectItemEventBus, setProjectItem]);

  if (!projectItem) return null;

  return (
    <div className={styles.editProjectContainer}>
      <div className={styles.editProject}>
        <div className={styles.editorContainer}>
          <div className={styles.title}>
            <EditText
              key={projectItem.id}
              ref={titleRef}
              defaultValue={projectItem.title}
              onChange={onTitleChange}
              contentEditable={!readonly}
              onPressEnter={onPressEnter}
            />
          </div>
          <div className={styles.time}>
            <div>创建于 {formatDate(projectItem.createTime, true)}</div>
            <div>最后修改于 {formatDate(projectItem.updateTime, true)}</div>
          </div>
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <ErrorBoundary>
              <Editor
                key={projectItem.id}
                ref={editorRef}
                initValue={projectItem.content}
                onInit={onInit}
                onChange={onContentChange}
                uploadResource={uploadResource}
                readonly={readonly}
                extensions={extensions}
                disableStartExtensions={useNotionExtensions}
              />
            </ErrorBoundary>
          </EditCardContext.Provider>
        </div>
        <EditorOutline
          className={styles.outline}
          content={projectItem.content}
          show={showOutline}
          onClickHeader={onClickHeader}
        />
      </div>
      <div className={styles.statusBar}>
        <div
          style={{
            lineHeight: "20px",
            fontSize: 14,
            opacity: 0.8,
          }}
        >
          <div>字数：{projectItem.count}</div>
        </div>
        {isNotionDocument && notionSync && (
          <NotionSyncStatus
            notionSync={notionSync}
            status={syncStatus}
            onManualSync={handleManualSync}
            onSyncFromNotion={handleSyncFromNotion}
            onDisconnect={handleDisconnect}
            onOpenInNotion={handleOpenInNotion}
          />
        )}
      </div>

      {/* Notion 冲突解决模态框 */}
      {conflictModalOpen && localContent && notionContent && (
        <NotionConflictModal
          open={conflictModalOpen}
          localContent={localContent}
          notionContent={notionContent}
          onUseLocal={handleUseLocalContent}
          onUseNotion={handleUseNotionContent}
          onCancel={handleCancelConflictModal}
        />
      )}
    </div>
  );
};

export default EditProjectItem;
