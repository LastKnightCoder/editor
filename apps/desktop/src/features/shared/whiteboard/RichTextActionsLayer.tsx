import { bindTextContent } from "@tau/whiteboard/extensions";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import { useBoard, BoardUtil, PathUtil, type BoardElement } from "@tau/whiteboard";
import EditTitleModal from "@/components/EditTitleModal";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import {
  createContent as baseCreateContent,
  updateContent as baseUpdateContent,
  deleteContent as baseDeleteContent,
} from "@/commands/content";
import {
  buildCardFromContent as baseBuildCardFromContent,
  getCardByContentId as baseGetCardByContentId,
} from "@/commands/card";
import {
  buildArticleFromContent as baseBuildArticleFromContent,
  getArticleByContentId as baseGetArticleByContentId,
} from "@/commands/article";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "@/services/command-context";

export function RichTextActionsLayer() {
  const board = useBoard();
  const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
  const {
    createContent,
    updateContent,
    deleteContent,
    buildCardFromContent,
    getCardByContentId,
    buildArticleFromContent,
    getArticleByContentId,
  } = useMemo(
    () =>
      bindDatabaseCommands(
        {
          createContent: baseCreateContent,
          updateContent: baseUpdateContent,
          deleteContent: baseDeleteContent,
          buildCardFromContent: baseBuildCardFromContent,
          getCardByContentId: baseGetCardByContentId,
          buildArticleFromContent: baseBuildArticleFromContent,
          getArticleByContentId: baseGetArticleByContentId,
        },
        { databaseName }
      ),
    [databaseName]
  );
  const [pendingRichTextCreateTarget, setPendingRichTextCreateTarget] = useState<{
    elementId: string;
    mode: "project";
    contentId: number;
    title: string;
  } | null>(null);
  const [pendingRichTextTitlePrompt, setPendingRichTextTitlePrompt] = useState<{
    elementId: string;
    mode: "project";
    contentId: number;
  } | null>(null);
  const richTextLinkCheckRef = useRef(
    new Map<
      string,
      {
        contentId: number;
        cardChecked: boolean;
        articleChecked: boolean;
      }
    >()
  );
  const ensureRichTextContentId = useMemoizedFn(async (elementId: string) => {
    const contentId = await bindTextContent(
      board,
      elementId,
      {
        create: createContent,
        update: updateContent,
        release: deleteContent,
      },
      () => board.getElement(elementId)?.content ?? []
    );
    if (!contentId) throw new Error("白板操作已取消");
    return { contentId };
  });

  useEffect(() => {
    const handleRichTextCreateAs = async (payload: {
      elementId: string;
      mode: "card" | "article" | "project";
    }) => {
      try {
        const canSubmit = board.captureSubmission(payload.elementId);
        const { contentId } = await ensureRichTextContentId(payload.elementId);
        if (!canSubmit()) return;
        const latestElement = BoardUtil.getElementById(board, payload.elementId) as
          | (BoardElement & {
              linkedCardId?: number;
              linkedArticleId?: number;
            })
          | null;
        if (payload.mode === "card") {
          const card = await buildCardFromContent(contentId);
          if (!canSubmit()) return;
          if (latestElement) {
            const path = PathUtil.getPathByElement(board, latestElement);
            if (path) {
              const newElement = {
                ...latestElement,
                linkedCardId: card.id,
              };
              const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
              if (ops.length > 0) {
                board.apply(ops);
              }
            }
          }
          toast.success("创建卡片成功");
          return;
        }
        if (payload.mode === "article") {
          const article = await buildArticleFromContent(contentId);
          if (!canSubmit()) return;
          if (latestElement) {
            const path = PathUtil.getPathByElement(board, latestElement);
            if (path) {
              const newElement = {
                ...latestElement,
                linkedArticleId: article.id,
              };
              const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
              if (ops.length > 0) {
                board.apply(ops);
              }
            }
          }
          toast.success("创建文章成功");
          return;
        }
        setPendingRichTextTitlePrompt({
          elementId: payload.elementId,
          mode: payload.mode,
          contentId,
        });
      } catch (error) {
        console.error("Failed to create content from rich text:", error);
        toast.error("创建失败");
      }
    };

    board.on("richtext:create-as", handleRichTextCreateAs);
    return () => {
      board.off("richtext:create-as", handleRichTextCreateAs);
    };
  }, [board, ensureRichTextContentId]);

  const { children } = useSyncExternalStore(board.subscribe, board.getSnapshot);
  useEffect(() => {
    const currentElementIds = new Set(children.map(child => child.id));
    for (const elementId of richTextLinkCheckRef.current.keys()) {
      if (!currentElementIds.has(elementId)) {
        richTextLinkCheckRef.current.delete(elementId);
      }
    }

    children.forEach(child => {
      if (child.type !== "richtext" || !child.contentId) {
        return;
      }

      const cached = richTextLinkCheckRef.current.get(child.id);
      const record =
        cached && cached.contentId === child.contentId
          ? cached
          : {
              contentId: child.contentId,
              cardChecked: false,
              articleChecked: false,
            };

      if (record !== cached) {
        richTextLinkCheckRef.current.set(child.id, record);
      }

      if (child.linkedCardId) {
        record.cardChecked = true;
      }
      if (child.linkedArticleId) {
        record.articleChecked = true;
      }

      if (!child.linkedCardId && !record.cardChecked) {
        record.cardChecked = true;
        getCardByContentId(child.contentId)
          .then(card => {
            if (board.isDestroyed || board.readonly) return;
            if (!card) return;
            const latestElement = BoardUtil.getElementById(board, child.id) as
              | (BoardElement & {
                  contentId?: number;
                  linkedCardId?: number;
                })
              | null;
            if (
              !latestElement ||
              latestElement.type !== "richtext" ||
              latestElement.contentId !== child.contentId ||
              latestElement.linkedCardId
            ) {
              return;
            }

            const path = PathUtil.getPathByElement(board, latestElement);
            if (!path) return;
            const newElement = {
              ...latestElement,
              linkedCardId: card.id,
            };
            const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
            if (ops.length > 0) {
              board.apply(ops);
            }
          })
          .catch(error => {
            console.error("Failed to hydrate rich text card link:", error);
          });
      }

      if (!child.linkedArticleId && !record.articleChecked) {
        record.articleChecked = true;
        getArticleByContentId(child.contentId)
          .then(article => {
            if (board.isDestroyed || board.readonly) return;
            if (!article) return;
            const latestElement = BoardUtil.getElementById(board, child.id) as
              | (BoardElement & {
                  contentId?: number;
                  linkedArticleId?: number;
                })
              | null;
            if (
              !latestElement ||
              latestElement.type !== "richtext" ||
              latestElement.contentId !== child.contentId ||
              latestElement.linkedArticleId
            ) {
              return;
            }

            const path = PathUtil.getPathByElement(board, latestElement);
            if (!path) return;
            const newElement = {
              ...latestElement,
              linkedArticleId: article.id,
            };
            const ops = BoardUtil.diffNodePatchOnly(latestElement, newElement, path);
            if (ops.length > 0) {
              board.apply(ops);
            }
          })
          .catch(error => {
            console.error("Failed to hydrate rich text article link:", error);
          });
      }
    });
  }, [board, children]);

  return (
    <>
      <EditTitleModal
        open={pendingRichTextTitlePrompt !== null}
        onCancel={() => setPendingRichTextTitlePrompt(null)}
        onConfirm={({ title }) => {
          if (!pendingRichTextTitlePrompt) return;
          setPendingRichTextCreateTarget({
            ...pendingRichTextTitlePrompt,
            title,
          });
          setPendingRichTextTitlePrompt(null);
        }}
        initialTitle=""
        modalTitle="创建项目文档"
        modalDescription="请输入标题后再选择插入位置"
        placeholder="请输入标题"
      />
      <InsertNoteToTreeModal
        mode={pendingRichTextCreateTarget?.mode || "project"}
        open={pendingRichTextCreateTarget !== null}
        noteTitle={pendingRichTextCreateTarget?.title || ""}
        noteContent={
          pendingRichTextCreateTarget
            ? (
                BoardUtil.getElementById(
                  board,
                  pendingRichTextCreateTarget.elementId
                ) as BoardElement & {
                  content?: any[];
                }
              )?.content || []
            : []
        }
        sourceContentId={pendingRichTextCreateTarget?.contentId || null}
        insertMode="shared-content"
        onCancel={() => setPendingRichTextCreateTarget(null)}
        onSuccess={() => {
          setPendingRichTextCreateTarget(null);
          toast.success("创建成功");
        }}
      />
    </>
  );
}
