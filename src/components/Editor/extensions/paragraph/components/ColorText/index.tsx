import { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn, useClickAway } from 'ahooks';

import SVG from 'react-inlinesvg';
import { BiChevronDown } from 'react-icons/bi';
import ColorSelect from "../ColorSelect";

import classnames from "classnames";
import { isMarkActive } from "../../hovering-bar-configs/utils.ts";

import color from '@/assets/hovering_bar/color.svg';

import { HoveringBarContext } from "@/components/Editor/components/HoveringToolbar";

import styles from './index.module.less';
import { Tooltip } from "antd";

const ColorText = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive('color', editor, selection);
  }, [editor, selection])

  const { isHoveringBarShow } = useContext(HoveringBarContext);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  useClickAway(() => {
    setOpen(false);
  }, ref);

  const handleClick = useMemoizedFn((_event: React.MouseEvent) => {
    Editor.addMark(editor, 'color', color);
    if (selection && !Range.isCollapsed(selection)) {
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: 'end' });
    }
  });

  return (
    <div
      ref={ref}
      className={classnames(styles.textContainer, { [styles.active]: active })}
      onClick={() => {
        setOpen(!open);
      }}
    >
      <Tooltip
        title={'颜色'}
        trigger={'hover'}
      >
        <div className={styles.text}>
          <SVG src={color} style={{ fill: 'currentcolor', width: 16, height: 16 }} />
          <BiChevronDown />
        </div>
      </Tooltip>
      <ColorSelect
        open={open}
        onClick={handleClick}
      />
    </div>
  )
}

export default ColorText;