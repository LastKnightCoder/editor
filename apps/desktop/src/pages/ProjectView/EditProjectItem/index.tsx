import { useEffect, useRef, useMemo, useState } from "react";
import { Descendant, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { Tooltip } from "antd";
import { Maximize2 } from "lucide-react";
import useEdit from "./useEdit";
import { formatDate, defaultProjectItemEventBus } from "@/utils";
import { Editor, EditorRef } from "@tau/editor/src";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import useEditContent from "@/hooks/useEditContent";
import useRegisterActiveEditingContext from "@/hooks/useRegisterActiveEditingContext";
import NotionSyncStatus from "@/components/NotionSyncStatus";
import NotionConflictModal from "@/components/NotionConflictModal";
import { notionCompatibleExtensions } from "@tau/editor/src";
import { useNotionSyncIntegration } from "./useNotionSyncIntegration";
import useThemeColors from "@/hooks/useThemeColors";
import ImmersiveEditorMode, {
  type ImmersiveEditorExitPayload,
} from "@/components/ImmersiveEditorMode";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import { createProjectCardListExtension } from "@/editor-extensions";

const cloneRange = (selection: Range | null): Range | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
  };
};

const EditProjectItem = (props: { projectItemId: number }) => {
  const { projectItemId } = props;
  const editorRef = useRef<EditorRef>(null);
  const immersiveEntrySelectionRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Range | null>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { borderClass } = useThemeColors();

  const {
    projectItem,
    onInit,
    onTitleChange,
    onContentChange: onContentChangeFromEditProjectItem,
    saveProjectItem,
    setProjectItem,
  } = useEdit(projectItemId);

  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const editorExtensions = useMemo(() => {
    return [
      ...dynamicExtensions,
      createProjectCardListExtension(projectItemId),
    ];
  }, [dynamicExtensions, projectItemId]);

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
    return editorExtensions;
  }, [isNotionDocument, useNotionExtensions, editorExtensions]);

  const { throttleHandleEditorContentChange } = useEditContent(
    projectItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );
  const {
    handleSelectionChange: handleEditorSelectionChange,
    handleFocus: handleEditorFocus,
    handleBlur: handleEditorBlur,
  } = useRegisterActiveEditingContext({
    contentId: projectItem?.contentId,
    entityType: "project-item",
    entityId: projectItem?.id,
    editorRef,
    content: projectItem?.content,
  });

  useRafInterval(async () => {
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  }, 1000);

  useUnmount(async () => {
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

  const handleImmersiveExit = useMemoizedFn(
    (payload?: ImmersiveEditorExitPayload) => {
      pendingSelectionRef.current = payload?.selection ?? null;
      setImmersiveMode(false);
      setEditorRemountKey((current) => current + 1);
    },
  );

  useEffect(() => {
    if (immersiveMode || !pendingSelectionRef.current) return;

    const timer = window.setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      const selection = pendingSelectionRef.current;
      if (!editor || !selection) return;

      try {
        Transforms.select(editor, selection);
        ReactEditor.focus(editor as any);
        pendingSelectionRef.current = null;
      } catch (error) {
        console.warn("恢复沉浸模式焦点失败:", error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editorRemountKey, immersiveMode]);

  const handleEnterImmersiveMode = useMemoizedFn(() => {
    immersiveEntrySelectionRef.current = cloneRange(
      editorRef.current?.getEditor().selection ?? null,
    );
    setImmersiveMode(true);
  });

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
  }, [projectItemId, projectItemEventBus, setProjectItem, projectItem]);

  if (!projectItem) return null;

  return (
    <div className="relative h-full w-full">
      <div className="@container/editor flex h-full w-full justify-center gap-10 overflow-y-auto px-10 py-5">
        <div className="relative min-w-0 max-w-[720px] flex-1">
          <div
            className={`mb-5 border-b ${borderClass} pb-2.5 text-[2.2em] font-bold`}
          >
            <EditText
              key={projectItem.id}
              ref={titleRef}
              defaultValue={projectItem.title}
              onChange={onTitleChange}
              contentEditable={true}
              onPressEnter={onPressEnter}
            />
          </div>
          <div className="mb-6 flex gap-2.5 text-[0.9em] opacity-80">
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
                key={`${projectItem.id}-${editorRemountKey}`}
                ref={editorRef}
                initValue={projectItem.content}
                onInit={onInit}
                onChange={onContentChange}
                onSelectionChange={handleEditorSelectionChange}
                onFocus={handleEditorFocus}
                onBlur={handleEditorBlur}
                readonly={false}
                extensions={extensions}
                disableStartExtensions={useNotionExtensions}
              />
            </ErrorBoundary>
          </EditCardContext.Provider>
        </div>
        <EditorOutline
          className="@[720px]/editor:block hidden"
          content={projectItem.content}
          show={true}
          onClickHeader={onClickHeader}
        />
      </div>
      <div className="absolute bottom-2.5 right-10 flex items-center gap-2 opacity-80">
        <div className="text-sm leading-5 opacity-80">
          <div>字数：{projectItem.count}</div>
        </div>
        <Tooltip title="沉浸模式">
          <div
            className="cursor-pointer p-1 hover:bg-black/10 rounded transition-colors"
            onClick={handleEnterImmersiveMode}
          >
            <Maximize2 size={14} />
          </div>
        </Tooltip>
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

      {/* 沉浸模式 */}
      {immersiveMode && (
        <ImmersiveEditorMode
          initValue={projectItem.content}
          initialSelection={immersiveEntrySelectionRef.current}
          onChange={onContentChange}
          onInit={onInit}
          onExit={handleImmersiveExit}
          wordCount={projectItem.count}
          readonly={false}
          extensions={extensions}
        />
      )}
    </div>
  );
};

export default EditProjectItem;
