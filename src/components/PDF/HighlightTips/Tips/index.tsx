import React, { useState } from "react";
import classnames from "classnames";
import { Button, Modal } from "antd";
import { v4 as getUUid } from 'uuid';
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import For from "@/components/For";
import Editor from "@/components/Editor";
import If from "@/components/If";
import NoteEditView from "../NoteEditView";

import { CloseOutlined, HighlightOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { MdOutlineWaves, MdOutlineTextFormat } from "react-icons/md";

import { EHighlightColor, EHighlightTextStyle, PdfHighlight, Note } from "@/types";

import styles from './index.module.less';
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface TipsProps {
  activeHighlightTextStyle: EHighlightTextStyle;
  activeColor: EHighlightColor;
  notes: PdfHighlight['notes'];
  onSelectTextStyle?: (textStyle: EHighlightTextStyle) => void;
  onSelectColor?: (color: EHighlightColor) => void;
  onNotesChange?: (notes: PdfHighlight['notes']) => void;
  onClose?: () => void;
  onRemove?: () => void;
  arrowDirection?: 'left' | 'right' | 'top' | 'bottom';
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
    arrowDirection = 'left',
    className,
    style,
    onSelectColor,
    onSelectTextStyle,
    onNotesChange,
    onClose,
    onRemove,
  } = props;

  const [editingNote, setEditingNote] = useState<Note | null>(null);

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

  const onClickAddNote = useMemoizedFn(() => {
    const newNote: Note = {
      id: getUUid(),
      note: [{
        type: 'paragraph',
        children: [{ type: 'formatted', text: '' }],
      }]
    };
    setEditingNote(newNote);
  });

  const onEditNoteFinish = useMemoizedFn((note: Note) => {
    // 如果 notes 中有则更新，否则新增
    const newNotes = produce(notes, (draft) => {
      const index = draft.findIndex((item) => item.id === note.id);
      if (index !== -1) {
        draft[index] = note;
      } else {
        draft.push(note);
      }
    });
    onNotesChange?.(newNotes);
    setEditingNote(null);
  });

  const onDeleteNote = useMemoizedFn((note: Note) => {
    Modal.confirm({
      title: '确定删除该笔记吗？',
      onOk: () => {
        const newNotes = produce(notes, (draft) => {
          const index = draft.findIndex((item) => item.id === note.id);
          if (index !== -1) {
            draft.splice(index, 1);
          }
        });
        setEditingNote(null);
        onNotesChange?.(newNotes);
      },
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
    })
  });

  const onEditNote = useMemoizedFn((note: Note) => {
    setEditingNote(note);
  });

  const onEditNoteCancel = useMemoizedFn(() => {
    setEditingNote(null);
  });
  
  return (
    <div className={classnames(styles.notesTipContainer, className)} style={style}>
      <div className={styles.strictHeight}>
        <DndProvider backend={HTML5Backend}>
          <If condition={!editingNote}>
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
              <div className={styles.verticalLine}/>
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
              <If condition={notes.length > 0}>
                <For
                  data={notes}
                  renderItem={(note) => (
                    <div
                      key={note.id}
                      className={styles.noteItem}
                    >
                      <Editor
                        className={styles.editor}
                        key={note.id}
                        initValue={note.note}
                        readonly
                      />
                      <div className={styles.editorIcons}>
                        <div className={styles.icon} onClick={() => {
                          onEditNote(note);
                        }}>
                          <EditOutlined style={{ fontSize: 12 }} />
                        </div>
                        <div className={styles.icon} onClick={() => {
                          onDeleteNote(note);
                        }}>
                          <DeleteOutlined style={{ fontSize: 12 }} />
                        </div>
                      </div>
                    </div>
                  )}
                />
              </If>
              <Button onClick={onClickAddNote}>添加笔记</Button>
            </div>
            <div className={classnames(styles.arrow, styles[arrowDirection])}/>
            <div className={styles.icons}>
              <div className={styles.deleteArea} onClick={onRemove}>
                <DeleteOutlined style={{ fontSize: 12 }}/>
              </div>
              <div className={styles.closeArea} onClick={onClose}>
                <CloseOutlined style={{ fontSize: 12 }}/>
              </div>
            </div>
          </If>
          <If condition={!!editingNote}>
            <NoteEditView
              note={editingNote!}
              onFinish={onEditNoteFinish}
              onCancel={onEditNoteCancel}
            />
          </If>
        </DndProvider>
      </div>
    </div>
  )
}

export default Tips;