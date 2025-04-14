import { useMemo, useState, useRef, useContext, memo } from "react";
import { BaseSelection, Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { message, Tooltip } from "antd";
import SVG from "react-inlinesvg";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { EditContentContext } from "@/context";
import { SearchResult } from "@/types";

import classnames from "classnames";
import { unwrapContentLink, wrapContentLink } from "../utils";
import card from "@/assets/hovering_bar/card.svg";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";

import styles from "./index.module.less";

const LinkHoveringItem = memo(() => {
  const selectionRef = useRef<BaseSelection | null>(null);
  const [openSelectModal, setOpenSelectModal] = useState<boolean>(false);
  const { contentId } = useContext(EditContentContext) || {};
  const extensions = useDynamicExtensions();

  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [contentLink] = Editor.nodes(editor, {
      // @ts-ignore 外部扩展，没有定义 content-link
      match: (n) => !Editor.isEditor(n) && n.type === "content-link",
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
    const cardResults = Array.isArray(selectedResult)
      ? selectedResult
      : [selectedResult];
    if (cardResults.length === 0) {
      message.warning("请选择内容");
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
      <Tooltip title={"关联内容"} trigger={"hover"}>
        <div
          className={classnames(styles.markTextContainer, {
            [styles.active]: isActive,
          })}
          onClick={handleClick}
        >
          <SVG
            src={card}
            style={{ fill: "currentcolor", width: 16, height: 16 }}
          />
        </div>
      </Tooltip>
      <ContentSelectorModal
        title="选择关联内容"
        open={openSelectModal}
        onCancel={onCancelSelect}
        onSelect={onSelectOk}
        contentType={["card", "article", "project-item", "document-item"]}
        extensions={extensions}
        emptyDescription="没有可选择的内容"
        showTitle={false}
        multiple={false}
        excludeContentIds={excludeContentIds}
      />
    </div>
  );
});

export default LinkHoveringItem;
