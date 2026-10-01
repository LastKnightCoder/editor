import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from "react";
import { Descendant, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { cn, useEdgeFade } from "@tau/ui";
import { useProjectContext } from "../ProjectContext";
import useEdit from "./useEdit";
import { formatDate, defaultProjectItemEventBus } from "@/utils";
import { EditorRef } from "@tau/editor";
import Editor from "@/components/ContentEditor";
import AddTag from "@/components/AddTag";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import { EditTextHandle } from "@/components/EditText";
import EditText from "@/components/CollaborativeTitle";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { EditCardContext } from "@/context.ts";
import useEditContent from "@/hooks/useEditContent";
import ImmersiveEditorMode, {
  type ImmersiveEditorExitPayload,
} from "@/components/ImmersiveEditorMode";

import { createProjectCardListExtension } from "@/editor-extensions";

const DOCUMENT_COLUMNS = "grid grid-cols-[minmax(0,720px)] items-start justify-center gap-7 px-6";

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
  const collaborationRef = useRef<ContentCollaborationControlHandle>(null);
  const { documentAction, clearDocumentAction } = useProjectContext();
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  const [outlineScrollEl, setOutlineScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(outlineScrollEl);
  const [outlineMaxHeight, setOutlineMaxHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!scrollEl) return;
    const updateHeight = () => setOutlineMaxHeight(Math.max(0, scrollEl.clientHeight - 40));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);
  const immersiveEntrySelectionRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Range | null>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);

  const borderClass = "border-line-1";

  const {
    projectItem,
    onInit,
    onTitleChange,
    onContentChange: onContentChangeFromEditProjectItem,
    saveProjectItem,
    setProjectItem,
  } = useEdit(projectItemId);

  const editorExtensions = useMemo(() => {
    return [createProjectCardListExtension(projectItemId)];
  }, [projectItemId]);

  const extensions = editorExtensions;

  const { throttleHandleEditorContentChange } = useEditContent(projectItem?.contentId, content => {
    editorRef.current?.setEditorValue(content);
    onContentChangeFromEditProjectItem(content);
  });
  useRafInterval(async () => {
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent("project-item:updated", updatedProjectItem);
    }
  }, 1000);

  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent("project-item:updated", updatedProjectItem);
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    onContentChangeFromEditProjectItem(content);
  });

  const handleImmersiveExit = useMemoizedFn((payload?: ImmersiveEditorExitPayload) => {
    pendingSelectionRef.current = payload?.selection ?? null;
    setImmersiveMode(false);
    setEditorRemountKey(current => current + 1);
  });

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
      editorRef.current?.getEditor().selection ?? null
    );
    setImmersiveMode(true);
  });

  useEffect(() => {
    if (!projectItem || documentAction?.itemId !== projectItemId) return;
    if (documentAction.type === "immersive") handleEnterImmersiveMode();
    else collaborationRef.current?.open();
    clearDocumentAction?.();
  }, [documentAction, projectItem, projectItemId, clearDocumentAction, handleEnterImmersiveMode]);

  const headers = useMemo(
    () => extractContentHeaders(projectItem?.content),
    [projectItem?.content]
  );
  const resolveAnchor = useCallback((_header: OutlineHeader, index: number) => {
    return resolveEditorHeaderAnchor(editorRef.current?.getEditor(), index);
  }, []);

  const onPressEnter = useMemoizedFn(async () => {
    titleRef.current?.blur();
    editorRef.current?.focus();
    // 保存项目
    const updatedProjectItem = await saveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent("project-item:updated", updatedProjectItem);
    }
  });

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      projectItemId,
      data => {
        setProjectItem(data.projectItem);
        if (!projectItem) return;
        if (data.projectItem.title !== projectItem?.title) {
          titleRef.current?.setValue(data.projectItem.title);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemId, projectItemEventBus, setProjectItem, projectItem]);

  if (!projectItem) return null;

  return (
    // py-4：滚动视口与纸面上下缘留出圆角半径的间距，正文滚动时在视口边缘渐隐，不贴卡片边缘裁切
    <div className="@container/editor relative h-full py-4 pr-4">
      <div
        ref={setScrollEl}
        className="edge-fade-scroll tau-sheet-scroll h-full overflow-y-auto [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]"
      >
        <div
          className={cn(
            DOCUMENT_COLUMNS,
            "pt-5",
            headers.length > 0 && "@[960px]/editor:grid-cols-[minmax(0,720px)_208px]"
          )}
        >
          <article className="min-w-0">
            <header className="min-w-0">
              <div className={`mb-5 border-b ${borderClass} pb-2.5 text-[2.2em] font-bold`}>
                <EditText
                  contentId={projectItem.contentId}
                  source={{
                    sourceType: "project-item",
                    sourceId: projectItem.id,
                    sourceTitle: projectItem.title,
                  }}
                  key={projectItem.id}
                  ref={titleRef}
                  defaultValue={projectItem.title}
                  onChange={onTitleChange}
                  contentEditable={true}
                  onPressEnter={onPressEnter}
                />
              </div>
              <div className="mb-6 flex items-center gap-2.5">
                <div className="flex gap-2.5 text-[0.9em] opacity-80">
                  <div>创建于 {formatDate(projectItem.createTime, true)}</div>
                  <div>最后修改于 {formatDate(projectItem.updateTime, true)}</div>
                  {/* 字数属于文档本身，随信息行走（项目详情不设底部状态栏） */}
                  <div className="tabular-nums">{projectItem.count.toLocaleString("zh-CN")} 字</div>
                </div>
                {/* 协作：已共享时常驻成员条（点开成员 Popover）；未共享不占位，由列表菜单「发起协作」打开对话框 */}
                <span className="ml-auto">
                  <ContentCollaborationControl
                    ref={collaborationRef}
                    hideTrigger
                    presence
                    contentId={projectItem.contentId}
                    source={{
                      sourceType: "project-item",
                      sourceId: projectItem.id,
                      sourceTitle: projectItem.title,
                    }}
                  />
                </span>
              </div>
            </header>
            <EditCardContext.Provider
              value={{
                cardId: -1,
              }}
            >
              <ErrorBoundary>
                <Editor
                  contentId={projectItem?.contentId}
                  key={`${projectItem.id}-${editorRemountKey}`}
                  ref={editorRef}
                  initValue={projectItem.content}
                  onInit={onInit}
                  onChange={onContentChange}
                  readonly={false}
                  editingContext={{ entityType: "project-item", entityId: projectItem.id }}
                  extensions={extensions}
                />
              </ErrorBoundary>
            </EditCardContext.Provider>
            <AddTag
              className="mt-6"
              tags={projectItem.tags ?? []}
              addTag={tag =>
                setProjectItem(current =>
                  current
                    ? {
                        ...current,
                        tags: [...new Set([...(current.tags ?? []), tag])],
                      }
                    : current
                )
              }
              removeTag={tag =>
                setProjectItem(current =>
                  current
                    ? {
                        ...current,
                        tags: (current.tags ?? []).filter(value => value !== tag),
                      }
                    : current
                )
              }
              editTag={(before, after) =>
                setProjectItem(current =>
                  current
                    ? {
                        ...current,
                        tags: [
                          ...new Set(
                            (current.tags ?? []).map(value => (value === before ? after : value))
                          ),
                        ],
                      }
                    : current
                )
              }
              onReorder={tags =>
                setProjectItem(current => (current ? { ...current, tags } : current))
              }
            />
          </article>
          {headers.length > 0 && (
            <div
              ref={setOutlineScrollEl}
              className="@[960px]/editor:block edge-fade-scroll sticky top-5 hidden overflow-y-auto overscroll-y-contain"
              style={{ maxHeight: outlineMaxHeight }}
            >
              <ContentOutline
                headers={headers}
                scrollEl={scrollEl}
                resolveAnchor={resolveAnchor}
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* 沉浸模式 */}
      {immersiveMode && (
        <ImmersiveEditorMode
          contentId={projectItem?.contentId}
          initValue={projectItem.content}
          initialSelection={immersiveEntrySelectionRef.current}
          onChange={onContentChange}
          onInit={onInit}
          onExit={handleImmersiveExit}
          extensions={extensions}
        />
      )}
    </div>
  );
};

export default EditProjectItem;
