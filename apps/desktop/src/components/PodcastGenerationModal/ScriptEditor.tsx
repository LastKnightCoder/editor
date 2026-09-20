import { useCallback, useRef } from "react";
import classNames from "classnames";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { Select } from "@tau/ui";
import { Button } from "./ui";
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
    collect: monitor => ({
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
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
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
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            ref={node => {
              drag(node);
            }}
            type="button"
            className="text-ink-3/60 hover:text-ink-3 hover:bg-hover flex h-7 w-6 cursor-grab items-center justify-center rounded transition-colors active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </button>
          <Select
            value={line.speaker}
            onValueChange={onSpeakerChange}
            className="w-[100px]"
            size="sm"
            options={speakers.map(s => ({ value: s.name, label: s.name }))}
          />
        </div>
        <button
          type="button"
          className="text-ink-3/60 hover:text-danger hover:bg-danger-soft flex h-7 w-7 items-center justify-center rounded opacity-0 transition-colors group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 文本输入区域 */}
      <textarea
        value={line.text}
        onChange={e => onTextChange(e.target.value)}
        placeholder="输入对话内容..."
        className="border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 focus:border-accent rounded-tau-sm text-tau-body w-full resize-none overflow-hidden border px-3 py-2.5 outline-none transition-colors"
        style={{ minHeight: "60px" }}
        onInput={e => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = target.scrollHeight + "px";
        }}
        ref={el => {
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

export const ScriptEditor = ({ scriptLines, speakers, updateScriptLines }: ScriptEditorProps) => {
  const handleMove = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newLines = [...scriptLines];
      const [removed] = newLines.splice(dragIndex, 1);
      newLines.splice(hoverIndex, 0, removed);
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines]
  );

  const handleSpeakerChange = useCallback(
    (index: number, value: string) => {
      const speaker = speakers.find(s => s.name === value);
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
    [scriptLines, speakers, updateScriptLines]
  );

  const handleTextChange = useCallback(
    (index: number, value: string) => {
      const newLines = [...scriptLines];
      newLines[index] = { ...newLines[index], text: value };
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines]
  );

  const handleDelete = useCallback(
    (index: number) => {
      const newLines = scriptLines.filter((_, i) => i !== index);
      updateScriptLines(newLines);
    },
    [scriptLines, updateScriptLines]
  );

  const handleAddLine = useCallback(() => {
    const lastLine = scriptLines[scriptLines.length - 1];
    const nextSpeaker = speakers.find(s => s.name !== lastLine?.speaker) || speakers[0];
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
    <div className="border-r-12 space-y-3 border-transparent">
      {scriptLines.map((line, index) => (
        <SortableScriptItem
          key={index}
          index={index}
          line={line}
          speakers={speakers}
          onSpeakerChange={value => handleSpeakerChange(index, value)}
          onTextChange={value => handleTextChange(index, value)}
          onDelete={() => handleDelete(index)}
          onMove={handleMove}
        />
      ))}

      <Button block icon={<Plus size={14} />} variant="dashed" onClick={handleAddLine}>
        添加对话
      </Button>
    </div>
  );
};

export default ScriptEditor;
