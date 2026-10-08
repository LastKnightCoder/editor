import { forwardRef, useEffect, useRef, type ComponentProps } from "react";
import * as Y from "yjs";
import { replaceText, type ContentSessionTarget, type SharedContent } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor-collab";
import { EditText, type EditTextHandle } from "@tau/ui";
import useContentSession from "@/hooks/useContentSession";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import useCollaborationPresence from "@/hooks/useCollaborationPresence";

type Props = ComponentProps<typeof EditText> & {
  contentId: number;
  source: Omit<ContentSessionTarget, "contentId">;
};

type FieldProps = ComponentProps<typeof EditText> & {
  binding?: EditorCollaborationBinding;
  article?: SharedContent;
  frozen?: boolean;
  /** 悬停提示的错误文案 */
  error?: string;
};

/** 按本地内容接入会话的标题（文章 / 项目文档等编辑页） */
const CollaborativeTitle = forwardRef<EditTextHandle, Props>(
  ({ contentId, source, ...props }, ref) => {
    const { entry, error: sessionError } = useContentSession(contentId, source);
    const { binding, article, frozen, error } = useCollaborationDocument(entry?.documentId);
    return (
      <CollaborativeTitleField
        {...props}
        ref={ref}
        binding={binding}
        article={article}
        frozen={frozen}
        error={error || sessionError}
      />
    );
  }
);

/**
 * 协作标题输入：直接消费调用方已建立的会话绑定（协作页同一视图的正文与标题共用一个
 * binding）。远端改动时按 Y 相对位置恢复本地选区，输入法组合期间不写入共享文本。
 */
export const CollaborativeTitleField = forwardRef<EditTextHandle, FieldProps>(
  ({ binding, article, frozen = false, error, onChange, ...props }, ref) => {
    const title = article?.title;
    const presence = useCollaborationPresence(binding, !props.contentEditable || frozen);
    const container = useRef<HTMLSpanElement>(null);
    const input = useRef<EditTextHandle | null>(null);
    const composing = useRef(false);
    const selection = useRef<{ anchor: Y.RelativePosition; focus: Y.RelativePosition } | undefined>(
      undefined
    );
    const callback = useRef(onChange);
    callback.current = onChange;
    const commitTitle = (title: string) => {
      if (
        !binding ||
        frozen ||
        !props.contentEditable ||
        title === binding.doc.getText("title").toString()
      )
        return;
      binding.doc.transact(
        () => replaceText(binding.doc.getText("title"), title.slice(0, 500)),
        binding.origin
      );
      callback.current?.(title);
    };
    useEffect(() => {
      if (!binding) return;
      const before = (transaction: Y.Transaction) => {
        selection.current = undefined;
        if (transaction.origin === binding.origin) return;
        const range = window.getSelection();
        if (
          !range?.anchorNode ||
          !container.current?.contains(range.anchorNode) ||
          !range.focusNode
        )
          return;
        const root = container.current.querySelector("[contenteditable]");
        if (!root) return;
        const offset = (node: Node, end: number) => {
          const value = document.createRange();
          value.selectNodeContents(root);
          value.setEnd(node, end);
          return value.toString().length;
        };
        const title = binding.doc.getText("title");
        selection.current = {
          anchor: Y.createRelativePositionFromTypeIndex(
            title,
            Math.min(title.length, offset(range.anchorNode, range.anchorOffset))
          ),
          focus: Y.createRelativePositionFromTypeIndex(
            title,
            Math.min(title.length, offset(range.focusNode, range.focusOffset))
          ),
        };
      };
      binding.doc.on("beforeTransaction", before);
      binding.flushLocal = () => {
        if (!composing.current) return;
        composing.current = false;
        binding.doc.transact(
          () =>
            replaceText(
              binding.doc.getText("title"),
              (input.current?.getValue() || "").slice(0, 500)
            ),
          binding.origin
        );
      };
      return () => {
        binding.doc.off("beforeTransaction", before);
        binding.flushLocal = undefined;
      };
    }, [binding]);
    useEffect(() => {
      if (!binding || title === undefined) return;
      if (input.current?.getValue() !== title) {
        input.current?.setValue(title);
        const text = container.current?.querySelector("[contenteditable]")?.firstChild;
        if (selection.current && text?.nodeType === Node.TEXT_NODE) {
          const anchor = Y.createAbsolutePositionFromRelativePosition(
            selection.current.anchor,
            binding.doc
          );
          const focus = Y.createAbsolutePositionFromRelativePosition(
            selection.current.focus,
            binding.doc
          );
          if (anchor && focus)
            window
              .getSelection()
              ?.setBaseAndExtent(
                text,
                Math.min(anchor.index, text.textContent?.length || 0),
                text,
                Math.min(focus.index, text.textContent?.length || 0)
              );
        }
      }
      selection.current = undefined;
      callback.current?.(title);
    }, [binding, title]);
    return (
      <span
        ref={container}
        style={{ display: "contents" }}
        title={error}
        onFocusCapture={presence.onFocus}
        onBlurCapture={presence.onBlur}
        onInputCapture={event => {
          if (!(event.nativeEvent as InputEvent).isComposing)
            commitTitle(input.current?.getValue() || "");
        }}
        onCompositionStartCapture={() => {
          composing.current = true;
        }}
        onCompositionEndCapture={() => {
          composing.current = false;
          commitTitle(input.current?.getValue() || "");
        }}
      >
        <EditText
          {...props}
          ref={value => {
            input.current = value;
            if (typeof ref === "function") ref(value);
            else if (ref) ref.current = value;
          }}
          contentEditable={props.contentEditable && Boolean(binding) && !frozen}
          onChange={commitTitle}
        />
      </span>
    );
  }
);

CollaborativeTitle.displayName = "CollaborativeTitle";
CollaborativeTitleField.displayName = "CollaborativeTitleField";
export default CollaborativeTitle;
