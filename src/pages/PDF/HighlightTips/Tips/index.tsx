import React from "react";
import classnames from "classnames";
import { Empty } from "antd";

import For from "@/components/For";
import Editor from "@/components/Editor";
import If from "@/components/If";

import { CloseOutlined, HighlightOutlined } from "@ant-design/icons";
import { MdOutlineWaves, MdOutlineTextFormat } from "react-icons/md";

import { EHighlightColor, EHighlightTextStyle } from "@/pages/PDF/constants";
import { Highlight } from '../../types.ts';

import styles from './index.module.less';

interface TipsProps {
  activeHighlightTextStyle: EHighlightTextStyle;
  activeColor: EHighlightColor;
  notes: Highlight['notes'];
  onSelectTextStyle?: (textStyle: EHighlightTextStyle) => void;
  onSelectColor?: (color: EHighlightColor) => void;
  onNotesChange?: (notes: Highlight['notes']) => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const colors = {
  [EHighlightColor.Red]: '#FF909C',
  [EHighlightColor.Blue]: '#7D9EFF',
  [EHighlightColor.Green]: '#A0D0A0',
  [EHighlightColor.Yellow]: '#FFF0A0',
  [EHighlightColor.Purple]: '#D0A0FF',
  [EHighlightColor.Pink]: '#FFA0D0',
}

const Tips = (props: TipsProps) => {

  const {
    activeHighlightTextStyle = EHighlightTextStyle.Highlight,
    activeColor = EHighlightColor.Red,
    notes = [],
    className,
    style,
    onSelectColor,
    onSelectTextStyle,
    onClose,
  } = props;

  const textStyleItems = [{
    icon: <HighlightOutlined />,
    type: EHighlightTextStyle.Highlight,
    active: activeHighlightTextStyle === EHighlightTextStyle.Highlight,
  }, {
    icon: <MdOutlineWaves />,
    type: EHighlightTextStyle.Wave,
    active: activeHighlightTextStyle === EHighlightTextStyle.Wave,
  }, {
    icon: <MdOutlineTextFormat />,
    type: EHighlightTextStyle.Underline,
    active: activeHighlightTextStyle === EHighlightTextStyle.Underline,
  }];
  
  return (
    <div className={classnames(styles.notesTipContainer, className)} style={style}>
      <div className={styles.title}>
        我的笔记
      </div>
      <div className={styles.textStyleSelect}>
        <div className={styles.selectContainer}>
          <For
            data={textStyleItems}
            renderItem={(item) => (
              <div
                key={item.type}
                onClick={() => onSelectTextStyle?.(item.type)}
                className={classnames(styles.styleItem)}
                style={{
                  border: item.active ? `2px solid ${colors[activeColor]}` : '2px solid transparent',
                  color: item.active ? colors[activeColor] : 'gray'
                }}
              >
                {item.icon}
              </div>
            )}
          />
        </div>
        <div className={styles.verticalLine} />
        <div className={styles.colorContainer}>
          <For
            data={Object.values(EHighlightColor)}
            renderItem={(color) => (
              <div
                key={color}
                onClick={() => onSelectColor?.(color)}
                style={{
                  backgroundColor: colors[color],
                  boxShadow: color === activeColor ? `0 0 0 2px white, 0 0 0 4px ${colors[activeColor]}` : 'none',
                }}
                className={classnames(styles.colorItem)}
              />
            )}
          />
        </div>
      </div>
      <div className={styles.noteContainer}>
        <If condition={notes.length === 0}>
          <Empty description={'暂无笔记'} />
        </If>
        <If condition={notes.length > 0}>
          <For
            data={notes}
            renderItem={(note) => (
              <div key={note.id} className={styles.noteItem}>
                <div className={styles.noteContent}>
                  <Editor
                    initValue={note.note}
                    readonly
                  />
                </div>
              </div>
            )}
          />
        </If>
      </div>
      <div className={styles.leftArrow} />
      <div className={styles.closeArea} onClick={onClose}>
        <CloseOutlined style={{ fontSize: 12 }} />
      </div>
    </div>
  )
}

export default Tips;