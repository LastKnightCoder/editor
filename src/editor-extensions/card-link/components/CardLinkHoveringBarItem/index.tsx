import { useMemo, useState, useRef, useContext, memo, useEffect } from "react";
import { BaseSelection, Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { message, Tooltip } from "antd";
import SVG from "react-inlinesvg";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { EditCardContext } from "@/context";
import { SearchResult, ICard, IndexType } from "@/types";

import classnames from "classnames";
import { unwrapCardLink, wrapCardLink } from "../utils";
import card from "@/assets/hovering_bar/card.svg";
import { IExtension } from "@/components/Editor";
import { getAllCards } from "@/commands";

import styles from "./index.module.less";

const LinkHoveringItem = memo(() => {
  const selectionRef = useRef<BaseSelection | null>(null);
  const [openSelectModal, setOpenSelectModal] = useState<boolean>(false);
  const { cardId } = useContext(EditCardContext) || {};
  const [extensions, setExtensions] = useState<IExtension[]>([]);
  const [cards, setCards] = useState<ICard[]>([]);

  const editor = useSlate();
  const selection = useSlateSelection();

  useEffect(() => {
    import("@/editor-extensions").then(
      ({ cardLinkExtension, fileAttachmentExtension }) => {
        setExtensions([cardLinkExtension, fileAttachmentExtension]);
      },
    );
  }, []);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const initialContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [cardLink] = Editor.nodes(editor, {
      // @ts-ignore 外部扩展，没有定义 card-link
      match: (n) => !Editor.isEditor(n) && n.type === "card-link",
    });
    return !!cardLink;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapCardLink(editor);
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
      message.warning("请选择卡片");
      return;
    }
    selectionRef.current && Transforms.select(editor, selectionRef.current);

    const [{ id }] = cardResults;
    wrapCardLink(editor, id);
    setOpenSelectModal(false);

    ReactEditor.focus(editor);
    Transforms.collapse(editor, { edge: "end" });
  };

  const excludeIds = useMemo(() => {
    return cardId ? [cardId] : [];
  }, [cardId]);

  return (
    <div>
      <Tooltip title={"关联卡片"} trigger={"hover"}>
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
        title="选择关联卡片"
        open={openSelectModal}
        onCancel={onCancelSelect}
        onSelect={onSelectOk}
        contentType="card"
        extensions={extensions}
        emptyDescription="没有可选择的卡片"
        showTitle={false}
        multiple={false}
        excludeIds={excludeIds}
        initialContents={initialContents}
      />
    </div>
  );
});

export default LinkHoveringItem;
