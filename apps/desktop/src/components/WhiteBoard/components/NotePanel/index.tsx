/**
 * 白板关联笔记面板（非模态 Drawer，盖在画布右侧，左缘拖拽调宽）。
 * 常驻挂载、由 contentId 驱动开合；正文按 contentId 挂 key 重挂——切换笔记时编辑器与
 * 内容会话整体换新，不会把上一篇的内容写进新笔记。键盘事件不冒泡出面板，
 * 白板在 document 上的快捷键（删除、方向键移动等）不会被笔记输入触发。
 */

import React, { useState } from "react";
import { Drawer, useRetainedValue } from "@tau/ui";
import Editor from "@/components/ContentEditor";
import { getEditorText } from "@/utils/editor";
import { useLocalStorageState } from "ahooks";

interface NotePanelProps {
  contentTitle?: string;
  contentId?: number | null;
  onClose: () => void;
}

function NoteBody({
  contentId,
  onTextChange,
}: {
  contentId: number;
  onTextChange: (text: string) => void;
}) {
  return (
    <Editor
      contentId={contentId}
      onChange={value => onTextChange(getEditorText(value, 20).trim())}
      className="min-h-full"
      readonly={false}
    />
  );
}

const NotePanel: React.FC<NotePanelProps> = ({ contentId, onClose, contentTitle }) => {
  const shownId = useRetainedValue(contentId);
  const [text, setText] = useState("");
  const [width, setWidth] = useLocalStorageState<number>("note-panel-width", {
    defaultValue: 400,
  });

  const title = contentTitle || (text.length < 20 ? text : `${text}...`) || "未命名笔记";

  return (
    <Drawer
      modal={false}
      open={contentId != null}
      onOpenChange={open => !open && onClose()}
      title={title}
      closeLabel="关闭笔记"
      width={width || 400}
      onWidthChange={setWidth}
      minWidth={200}
      maxWidth={600}
      isolateKeyboard
      className="z-50"
    >
      {shownId != null && <NoteBody key={shownId} contentId={shownId} onTextChange={setText} />}
    </Drawer>
  );
};

export default NotePanel;
