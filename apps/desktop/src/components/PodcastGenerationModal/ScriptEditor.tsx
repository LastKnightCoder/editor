import { useCallback, useRef } from "react";
import classNames from "classnames";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { Button, SelectField } from "./ui";
import type { PodcastSpeaker, PodcastScriptLine } from "@/types/podcast";

const SCRIPT_LINE_TYPE = "SCRIPT_LINE";

interface DragItem {
  type: string;
  index: number;
}

interface SortableScriptItemProps {
  index: number;
  line: PodcastScriptLine;
  speakers: PodcastSpeaker[];
  onSpeakerChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onDelete: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
}

const SortableScriptItem = ({
  index,
  line,
  speakers,
  onSpeakerChange,
  onTextChange,
  onDelete,
  onMove,
}: SortableScriptItemProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: SCRIPT_LINE_TYPE,
    item: { type: SCRIPT_LINE_TYPE, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop<DragItem>({
    accept: SCRIPT_LINE_TYPE,
    hover: (item, monitor) => {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  preview(drop(ref));

  return (
    <div ref={ref} className={classNames("group", isDragging && "opacity-50")}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <button
            ref={(node) => {
              drag(node);
            }}
            type="button"
            className="w-6 h-7 flex items-center justify-center rounded text-gray-300 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical size={14} />
          </button>
          <SelectField
            value={line.speaker}
            onChange={onSpeakerChange}
            className="w-[100px]"
            size="small"
            options={speakers.map((s) => ({
              value: s.name,
              label: s.name,
            }))}
          />
        </div>
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded text-gray-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 文本输入区域 */}
      <textarea
        value={line.text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="输入对话内容..."
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 transition-colors duration-150 resize-none overflow-hidden"
        style={{ minHeight: "60px" }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = target.scrollHeight + "px";
        }}
        ref={(el) => {
          if (el) {
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
          }
        }}
      />
    </div>
  );
};

export interface ScriptEditorProps {
  scriptLines: PodcastScriptLine[];
  speakers: PodcastSpeaker[];
  updateScriptLines: (lines: PodcastScriptLine[]) => void;
}

export const ScriptEditor = ({
  scriptLines,
  speakers,
  updateScriptLines,
}: ScriptEditorProps) => {
  const handleMove = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newLines = [...scriptLines];
      const [removed] = newLines.splice(dragIndex, 1);
      newLines.splice(hoverIndex, 0, removed);
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines],
  );

  const handleSpeakerChange = useCallback(
    (index: number, value: string) => {
      const speaker = speakers.find((s) => s.name === value);
      if (speaker) {
        const newLines = [...scriptLines];
        newLines[index] = {
          ...newLines[index],
          speaker: value,
          voiceId: speaker.voiceId,
        };
        updateScriptLines(newLines);
      }
    },
    [scriptLines, speakers, updateScriptLines],
  );

  const handleTextChange = useCallback(
    (index: number, value: string) => {
      const newLines = [...scriptLines];
      newLines[index] = { ...newLines[index], text: value };
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines],
  );

  const handleDelete = useCallback(
    (index: number) => {
      const newLines = scriptLines.filter((_, i) => i !== index);
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines],
  );

  const handleAddLine = useCallback(() => {
    const lastLine = scriptLines[scriptLines.length - 1];
    const nextSpeaker =
      speakers.find((s) => s.name !== lastLine?.speaker) || speakers[0];
    updateScriptLines([
      ...scriptLines,
      {
        speaker: nextSpeaker.name,
        text: "",
        voiceId: nextSpeaker.voiceId,
        startTime: 0,
        duration: 0,
      },
    ]);
  }, [scriptLines, speakers, updateScriptLines]);

  return (
    <div className="space-y-3 border-r-12 border-transparent">
      {scriptLines.map((line, index) => (
        <SortableScriptItem
          key={index}
          index={index}
          line={line}
          speakers={speakers}
          onSpeakerChange={(value) => handleSpeakerChange(index, value)}
          onTextChange={(value) => handleTextChange(index, value)}
          onDelete={() => handleDelete(index)}
          onMove={handleMove}
        />
      ))}

      <Button
        block
        icon={<Plus size={14} />}
        variant="dashed"
        onClick={handleAddLine}
      >
        添加对话
      </Button>
    </div>
  );
};

export default ScriptEditor;
