import { useMemo, useState, useRef, useContext, memo } from "react";
import { BaseSelection, Editor, Element, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip, toast } from "@tau/ui";
import { FileText } from "lucide-react";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { EditContentContext } from "@/context";
import { SearchResult } from "@/types";

import classnames from "classnames";
import { unwrapContentLink, wrapContentLink } from "../utils";

const LinkHoveringItem = memo(() => {
  const selectionRef = useRef<BaseSelection | null>(null);
  const [openSelectModal, setOpenSelectModal] = useState<boolean>(false);
  const { contentId } = useContext(EditContentContext) || {};
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [contentLink] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && Element.isElement(n) && n.type === "content-link",
    });
    return !!contentLink;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapContentLink(editor);
        return;
      }
      setOpenSelectModal(true);
      const { selection } = editor;
      selectionRef.current = selection;
    } finally {
      Transforms.collapse(editor, { edge: "end" });
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const onCancelSelect = () => {
    setOpenSelectModal(false);
    ReactEditor.focus(editor);
    selectionRef.current && Transforms.select(editor, selectionRef.current);
    selectionRef.current = null;
  };

  const onSelectOk = async (selectedResult: SearchResult | SearchResult[]) => {
    const cardResults = Array.isArray(selectedResult) ? selectedResult : [selectedResult];
    if (cardResults.length === 0) {
      toast.warning("请选择内容");
      return;
    }
    selectionRef.current && Transforms.select(editor, selectionRef.current);

    const [{ contentId, type, title, id }] = cardResults;
    wrapContentLink(editor, contentId, type, title, id);
    setOpenSelectModal(false);

    ReactEditor.focus(editor);
    Transforms.collapse(editor, { edge: "end" });
  };

  const excludeContentIds = useMemo(() => {
    return contentId ? [contentId] : [];
  }, [contentId]);

  return (
    <div>
      {/* 层级抬到悬浮工具条（z 9999）之上，与编辑器内置按钮的提示一致 */}
      <Tooltip content={"关联内容"} className="z-[10200]">
        <div
          className={classnames(
            "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg",
            "ed-toolbar-item",
            isActive && "is-active"
          )}
          onClick={handleClick}
        >
          <FileText size={16} strokeWidth={2.5} />
        </div>
      </Tooltip>
      <ContentSelectorModal
        title="选择关联内容"
        open={openSelectModal}
        onCancel={onCancelSelect}
        onSelect={onSelectOk}
        contentType={["card", "article", "project-item", "diary-daily"]}
        emptyDescription="没有可选择的内容"
        showTitle={false}
        multiple={false}
        excludeContentIds={excludeContentIds}
      />
    </div>
  );
});

export default LinkHoveringItem;
