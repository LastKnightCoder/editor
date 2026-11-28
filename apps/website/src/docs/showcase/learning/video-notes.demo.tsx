/**
 * 视频笔记：左栏视频播放器与字幕，右栏笔记。
 * 点击字幕可跳转进度并「摘到笔记」生成带时间戳的引用块；点击笔记里的时间戳或插入时间戳可联动进度条。
 */
import { useState } from "react";
import { Camera, Clock, Pause, Play, Quote } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface SubtitleLine {
  id: number;
  time: string;
  seconds: number;
  chapter: string;
  text: string;
}

interface NoteItem {
  id: number;
  time: string;
  seconds: number;
  kind: "quote" | "note" | "frame";
  text: string;
}

const DURATION = 900;

const SUBTITLES: SubtitleLine[] = [
  {
    id: 1,
    time: "02:15",
    seconds: 135,
    chapter: "01 两种思维模式",
    text: "专注模式像手电筒的光束，适合沿着熟悉的路径深入推演。",
  },
  {
    id: 2,
    time: "04:12",
    seconds: 252,
    chapter: "01 两种思维模式",
    text: "发散模式则放松控制，让大脑在更广的区域建立意外连接。",
  },
  {
    id: 3,
    time: "07:30",
    seconds: 450,
    chapter: "02 卡住时怎么办",
    text: "卡住的时候先离开一会儿，去散步或洗个澡，交给发散模式接手。",
  },
  {
    id: 4,
    time: "10:48",
    seconds: 648,
    chapter: "02 卡住时怎么办",
    text: "真正的理解来自两种模式交替运行，而不是死磕同一个细节。",
  },
];

const INITIAL_NOTES: NoteItem[] = [
  {
    id: 1,
    time: "02:15",
    seconds: 135,
    kind: "quote",
    text: "专注模式像手电筒的光束，适合沿着熟悉的路径深入推演。",
  },
  {
    id: 2,
    time: "04:12",
    seconds: 252,
    kind: "note",
    text: "写难题卡壳时，硬坐着不如换去散步，和《深度工作》里的停工仪式呼应。",
  },
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function VideoNotesDemo() {
  const [current, setCurrent] = useState(252);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [excerpts, setExcerpts] = useState<number[]>([1]);

  const activeLine = [...SUBTITLES].reverse().find(line => line.seconds <= current) ?? SUBTITLES[0];

  const jumpTo = (seconds: number) => {
    setCurrent(seconds);
  };

  const addExcerpt = (line: SubtitleLine) => {
    if (!excerpts.includes(line.id)) setExcerpts(list => [...list, line.id]);
    setNotes(list => [
      ...list,
      { id: Date.now(), time: line.time, seconds: line.seconds, kind: "quote", text: line.text },
    ]);
    setCurrent(line.seconds);
  };

  const insertTimestamp = () => {
    const time = formatTime(current);
    setNotes(list => [
      ...list,
      {
        id: Date.now(),
        time,
        seconds: current,
        kind: "note",
        text: `在 ${activeLine.chapter.slice(3)} 处补充一条要点`,
      },
    ]);
  };

  const captureFrame = () => {
    const time = formatTime(current);
    setNotes(list => [
      ...list,
      {
        id: Date.now(),
        time,
        seconds: current,
        kind: "frame",
        text: `画面截帧 · ${activeLine.chapter.slice(3)}`,
      },
    ]);
  };

  return (
    <AppWindow active="projects" crumb="学会学习 / 专注模式与发散模式" height={430}>
      <div className="grid h-full grid-cols-[1.08fr_1fr] max-sm:grid-cols-1">
        {/* 左栏：播放器与字幕 */}
        <div className="border-line-2 flex min-h-0 flex-col border-r p-4">
          <div className="bg-ink-1 text-ink-inverse relative flex h-[142px] shrink-0 flex-col justify-between rounded-[10px] p-3.5">
            <div className="flex items-center justify-between text-[11px] opacity-80">
              <span>{activeLine.chapter}</span>
              <span className="font-tau-mono tabular-nums">
                {formatTime(current)} / {formatTime(DURATION)}
              </span>
            </div>
            <p className="line-clamp-2 text-center text-[13px] leading-relaxed font-medium">
              “{activeLine.text}”
            </p>
            <div>
              <div className="relative mb-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPlaying(value => !value)}
                  aria-label={playing ? "暂停" : "播放"}
                  className="bg-surface/15 hover:bg-surface/25 grid size-6 shrink-0 place-items-center rounded-full"
                >
                  {playing ? (
                    <Pause className="size-3" strokeWidth={2} />
                  ) : (
                    <Play className="size-3 translate-x-[0.5px]" strokeWidth={2} />
                  )}
                </button>
                <div className="bg-surface/25 relative h-1.5 flex-1 rounded-full">
                  <div
                    className="bg-accent h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${Math.min(100, (current / DURATION) * 100)}%` }}
                  />
                  {notes.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      title={`${item.time} ${item.text}`}
                      onClick={() => jumpTo(item.seconds)}
                      className={cn(
                        "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125",
                        item.kind === "frame"
                          ? "bg-warn size-2 rounded-[2px]"
                          : item.kind === "quote"
                            ? "bg-surface size-2 rounded-full"
                            : "border-surface bg-ink-1 size-2 rounded-full border"
                      )}
                      style={{ left: `${(item.seconds / DURATION) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-ink-3 text-tau-tiny mt-3 mb-1.5 flex items-center justify-between px-1">
            <span>字幕（点击跳转或摘进笔记）</span>
            <span>{SUBTITLES.length} 句</span>
          </div>
          <div className="scrollbar-hide min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {SUBTITLES.map(line => {
              const isCurrent = activeLine.id === line.id;
              const isExcerpted = excerpts.includes(line.id);
              return (
                <div
                  key={line.id}
                  onClick={() => jumpTo(line.seconds)}
                  className={cn(
                    "group cursor-pointer rounded-[9px] px-2.5 py-2 transition-colors",
                    isCurrent
                      ? "bg-selected"
                      : isExcerpted
                        ? "bg-accent-soft/50 hover:bg-hover"
                        : "hover:bg-hover"
                  )}
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-tau-mono text-accent-text text-[11px] tabular-nums">
                      {line.time}
                    </span>
                    <span className="text-ink-3 text-[10.5px]">{line.chapter}</span>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        addExcerpt(line);
                      }}
                      className="text-accent-text hover:bg-accent-soft ml-auto inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium"
                    >
                      <Quote className="size-3" strokeWidth={1.75} />
                      摘到笔记
                    </button>
                  </div>
                  <p className="text-tau-sm text-ink-1 leading-relaxed">{line.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右栏：笔记 */}
        <div className="flex min-h-0 flex-col p-4 max-sm:hidden">
          <div className="border-line-2 mb-3 flex items-center justify-between border-b pb-2.5">
            <span className="text-tau-body font-semibold">课堂笔记</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={insertTimestamp}
                className="text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11.5px]"
              >
                <Clock className="size-3.5" strokeWidth={1.75} />
                时间戳
              </button>
              <button
                type="button"
                onClick={captureFrame}
                className="text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11.5px]"
              >
                <Camera className="size-3.5" strokeWidth={1.75} />
                截帧
              </button>
            </div>
          </div>

          <div className="scrollbar-hide min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
            {notes.map(item => (
              <div
                key={item.id}
                className={cn(
                  "animate-doc-in rounded-[9px] text-[12.5px] leading-relaxed",
                  item.kind === "quote"
                    ? "border-accent bg-hover/70 border-l-2 py-2 pr-2.5 pl-3"
                    : item.kind === "frame"
                      ? "border-line-1 bg-page flex items-center gap-2 border px-2.5 py-2"
                      : "px-1 py-0.5"
                )}
              >
                <button
                  type="button"
                  onClick={() => jumpTo(item.seconds)}
                  className="bg-accent-soft text-accent-text font-tau-mono mr-2 inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium tabular-nums hover:opacity-80"
                >
                  {item.time}
                </button>
                <span className="text-ink-1">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
