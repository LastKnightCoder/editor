import { useMemo, useState, useRef, useContext, useEffect, memo } from "react";
import { BaseSelection, Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { message, Tooltip } from "antd";
import SVG from "react-inlinesvg";
import SelectCardModal from "@/components/SelectCardModal";
import { EditCardContext } from "@/context";

import classnames from "classnames";
import { unwrapCardLink, wrapCardLink } from "../utils";

import card from "@/assets/hovering_bar/card.svg";

import styles from "./index.module.less";
import { ICard } from "@/types";
import { getAllCards } from "@/commands";

const LinkHoveringItem = memo(() => {
  const selectionRef = useRef<BaseSelection | null>(null);
  const [openSelectModal, setOpenSelectModal] = useState<boolean>(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);
  const { cardId } = useContext(EditCardContext) || {};

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const editor = useSlate();
  const selection = useSlateSelection();

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
    setSelectedCards([]);
    ReactEditor.focus(editor);
    selectionRef.current && Transforms.select(editor, selectionRef.current);
    selectionRef.current = null;
  };

  const onSelectOk = async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning("请选择卡片");
      return;
    }
    selectionRef.current && Transforms.select(editor, selectionRef.current);
    const [{ id }] = selectedCards;
    wrapCardLink(editor, id);
    setOpenSelectModal(false);
    setSelectedCards([]);
    ReactEditor.focus(editor);
    Transforms.collapse(editor, { edge: "end" });
  };

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
      <SelectCardModal
        title={"选择关联卡片"}
        selectedCards={selectedCards}
        onChange={setSelectedCards}
        open={openSelectModal}
        allCards={cards}
        onCancel={onCancelSelect}
        onOk={onSelectOk}
        excludeCardIds={[cardId || -1]}
      />
    </div>
  );
});

export default LinkHoveringItem;
