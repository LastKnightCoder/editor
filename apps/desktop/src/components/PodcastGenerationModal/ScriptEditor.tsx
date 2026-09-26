import { useCallback, useRef } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { Button, IconButton, Select, Textarea, cn } from "@tau/ui";
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
    <div ref={ref} className={cn("group flex flex-col gap-1.5", isDragging && "opacity-50")}>
      <div className="flex items-center gap-1">
        <button
          ref={node => {
            drag(node);
          }}
          type="button"
          aria-label="拖动排序"
          className="text-ink-3 hover:text-ink-1 hover:bg-hover rounded-tau-sm -ml-1 flex h-7 w-5 cursor-grab items-center justify-center transition-colors active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </button>
        <Select
          aria-label="说话人"
          value={line.speaker}
          onValueChange={onSpeakerChange}
          className="w-[112px]"
          size="sm"
          options={speakers.map(s => ({ value: s.name, label: s.name }))}
        />
        <span className="text-ink-3 text-tau-micro ml-1 tabular-nums">#{index + 1}</span>
        <span className="flex-1" />
        <IconButton
          aria-label="删除这段对话"
          className="enabled:hover:text-danger size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>

      <Textarea
        value={line.text}
        onChange={e => onTextChange(e.target.value)}
        placeholder="输入对话内容…"
        rows={2}
        className="min-h-0 overflow-hidden"
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
    <div className="flex flex-col gap-4">
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

      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        onClick={handleAddLine}
        className="-ml-2 self-start"
      >
        添加对话
      </Button>
    </div>
  );
};

export default ScriptEditor;
