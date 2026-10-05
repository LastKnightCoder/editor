/**
 * 「写成卡片」新建的草稿卡片（services/pattern-card）：光标直接落在正文，空正文显示占位提示；详情页真正关闭时交给服务结算
 * （还空着就撤回）。去看用到这个思路的那几篇时页面只是保活隐藏，不结算。
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { Editor as SlateEditor, Transforms, type Editor } from "slate";
import { ReactEditor } from "slate-react";
import {
  patternCardPlaceholderOf,
  settlePatternCard,
  watchPatternCard,
} from "@/services/pattern-card";
import { isBlankCardContent } from "@/utils/card";

export function usePatternCardDraft(cardId: number | null, rootRef: RefObject<HTMLElement | null>) {
  const editorRef = useRef<Editor | null>(null);
  const placeholder = cardId ? patternCardPlaceholderOf(cardId) : null;

  useEffect(() => {
    if (!cardId || !placeholder) return;
    watchPatternCard(cardId, () => isBlankCardContent(editorRef.current?.children ?? []));
    const root = rootRef.current;
    return () => {
      // 保活隐藏也会清理 effect：节点还在文档里就是隐藏；已经移出文档才是关闭了详情页
      if (root?.isConnected) return;
      settlePatternCard(cardId);
    };
  }, [cardId, placeholder, rootRef]);

  const isDraft = Boolean(placeholder);
  const onInit = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      if (!isDraft) return;
      // 点完「写成卡片」直接就能打字
      window.setTimeout(() => {
        try {
          Transforms.select(editor, SlateEditor.start(editor, []));
          ReactEditor.focus(editor as ReactEditor);
        } catch {
          // 编辑器还没挂到页面上（或已卸载）时不抢焦点
        }
      }, 0);
    },
    [isDraft]
  );

  return { placeholder, onInit };
}
