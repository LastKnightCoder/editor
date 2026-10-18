import { useCallback, useRef, useState } from "react";
import { ChevronRight, Pause, Play, RefreshCw } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { Field, TextArea } from "./ui";
import { formatTime } from "./utils";
import type { PodcastScriptLine } from "@/types/podcast";
import { extractPodcastSegment } from "@/commands/podcast-audio";
import { remoteResourceToLocal } from "@/utils/resouce";
import { getHomeDir, readBinaryFile } from "@/commands/file";

const AUTO_SIZE = { minRows: 2, maxRows: 8 };

export interface ResultPreviewProps {
  audioUrl: string;
  duration: number;
  scriptLines: PodcastScriptLine[];
  segmentAudios: (Blob | null)[];
  regenerateSegment: (index: number, newText: string) => Promise<void>;
  notify: (type: "success" | "error" | "warning" | "info", text: string) => void;
}

export const ResultPreview = ({
  audioUrl,
  duration,
  scriptLines,
  segmentAudios,
  regenerateSegment,
  notify,
}: ResultPreviewProps) => {
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState<string>("");
  const [regeneratingSegmentIndex, setRegeneratingSegmentIndex] = useState<number | null>(null);
  const [extractingAudioIndex, setExtractingAudioIndex] = useState<number | null>(null);
  const [playingSegmentIndex, setPlayingSegmentIndex] = useState<number | null>(null);
  const [scriptOpen, setScriptOpen] = useState(true);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleStartEditSegment = useCallback((index: number, currentText: string) => {
    setEditingSegmentIndex(index);
    setEditingSegmentText(currentText);
  }, []);

  const handleCancelEditSegment = useCallback(() => {
    setEditingSegmentIndex(null);
    setEditingSegmentText("");
  }, []);

  const handleConfirmEditSegment = useCallback(async () => {
    if (editingSegmentIndex === null) return;

    const newText = editingSegmentText.trim();
    if (!newText) {
      notify("error", "文本不能为空");
      return;
    }

    const oldText = scriptLines[editingSegmentIndex].text;
    if (newText === oldText) {
      notify("info", "文本未改变");
      handleCancelEditSegment();
      return;
    }

    setRegeneratingSegmentIndex(editingSegmentIndex);
    setEditingSegmentIndex(null);
    setEditingSegmentText("");

    try {
      await regenerateSegment(editingSegmentIndex, newText);
    } finally {
      setRegeneratingSegmentIndex(null);
    }
  }, [
    editingSegmentIndex,
    editingSegmentText,
    notify,
    scriptLines,
    regenerateSegment,
    handleCancelEditSegment,
  ]);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setPlayingSegmentIndex(null);
  }, []);

  const handlePlaySegment = useCallback(
    async (index: number) => {
      if (playingSegmentIndex === index) {
        stopCurrentAudio();
        return;
      }

      if (currentAudioRef.current) {
        stopCurrentAudio();
      }

      const segment = segmentAudios[index];
      if (segment) {
        const audio = new Audio(URL.createObjectURL(segment));
        currentAudioRef.current = audio;
        setPlayingSegmentIndex(index);

        audio.play();

        audio.onended = () => {
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
          notify("error", "音频播放失败");
        };

        return;
      }

      if (!scriptLines[index] || scriptLines[index].duration <= 0) {
        notify("warning", "该句尚未生成音频，请先重新生成");
        return;
      }
      if (!audioUrl) {
        notify("error", "音频不可用");
        return;
      }

      setExtractingAudioIndex(index);
      try {
        let localAudioPath = "";
        if (audioUrl.startsWith("http")) {
          localAudioPath = await remoteResourceToLocal(audioUrl);
        } else if (audioUrl.startsWith("~")) {
          const homeDir = await getHomeDir();
          localAudioPath = `${homeDir}${audioUrl.slice(1)}`;
        } else {
          localAudioPath = audioUrl;
        }

        const { outputPath } = await extractPodcastSegment(
          localAudioPath,
          scriptLines[index].startTime,
          scriptLines[index].duration
        );

        const audioBuffer = (await readBinaryFile(outputPath)) as Uint8Array<ArrayBuffer>;
        const audioBlob = new Blob([audioBuffer.buffer], {
          type: "audio/mpeg",
        });
        const audioBlobUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioBlobUrl);
        currentAudioRef.current = audio;
        setPlayingSegmentIndex(index);

        audio.play();

        audio.onended = () => {
          URL.revokeObjectURL(audioBlobUrl);
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioBlobUrl);
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
          notify("error", "音频播放失败");
        };
      } catch (error) {
        console.error("提取音频片段失败:", error);
        notify("error", "提取音频片段失败");
      } finally {
        setExtractingAudioIndex(null);
      }
    },
    [segmentAudios, audioUrl, notify, scriptLines, playingSegmentIndex, stopCurrentAudio]
  );

  return (
    <div className="flex flex-col gap-4">
      <Field label="播客音频" hint={`时长 ${formatTime(duration)}`}>
        <audio key={audioUrl} controls className="h-10 w-full" src={audioUrl} />
      </Field>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setScriptOpen(v => !v)}
          aria-expanded={scriptOpen}
          className="text-ink-2 hover:text-ink-1 flex w-fit items-center gap-1 text-[12px] outline-none"
        >
          <ChevronRight
            className={cn(
              "ease-tau-out size-3.5 transition-transform duration-150",
              scriptOpen && "rotate-90"
            )}
            strokeWidth={1.75}
          />
          脚本
          <span className="text-ink-3 tabular-nums">{scriptLines.length} 段</span>
        </button>

        {scriptOpen && (
          <div className="-mx-3 flex flex-col gap-0.5">
            {scriptLines.map((line, index) => {
              const isEditing = editingSegmentIndex === index;
              const isRegenerating = regeneratingSegmentIndex === index;
              const isExtracting = extractingAudioIndex === index;
              const isPlaying = playingSegmentIndex === index;

              return (
                <div
                  key={index}
                  className={cn(
                    "rounded-tau-md ease-tau-out px-3 py-2.5 transition-colors duration-150",
                    isEditing
                      ? "bg-accent-soft"
                      : isRegenerating
                        ? "bg-warn-soft"
                        : isPlaying
                          ? "bg-selected"
                          : "hover:bg-hover"
                  )}
                >
                  <div className="mb-1 flex h-7 items-center gap-2">
                    <span className="text-ink-1 text-tau-meta font-medium">{line.speaker}</span>
                    <span className="text-ink-3 text-tau-micro tabular-nums">
                      {formatTime(line.startTime)} – {formatTime(line.startTime + line.duration)} ·{" "}
                      {line.duration.toFixed(1)}s
                    </span>
                    {isRegenerating && (
                      <span className="text-warn text-tau-meta flex items-center gap-1.5">
                        <RefreshCw className="size-3 animate-spin" strokeWidth={1.75} />
                        正在重新生成…
                      </span>
                    )}
                    <span className="flex-1" />
                    {!isEditing && !isRegenerating && (
                      <div className="-mr-1.5 flex items-center gap-0.5">
                        <Button
                          size="sm"
                          variant={isPlaying ? "soft" : "ghost"}
                          icon={isPlaying ? Pause : Play}
                          loading={isExtracting}
                          onClick={() => handlePlaySegment(index)}
                          className="px-2.5"
                        >
                          {isPlaying ? "停止试听" : "试听"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={RefreshCw}
                          onClick={() => handleStartEditSegment(index, line.text)}
                          className="px-2.5"
                        >
                          重生成
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <TextArea
                        value={editingSegmentText}
                        onChange={setEditingSegmentText}
                        autoSize={AUTO_SIZE}
                        autoFocus
                        placeholder="请输入文本内容"
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={handleCancelEditSegment}>
                          取消
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          icon={RefreshCw}
                          onClick={handleConfirmEditSegment}
                          disabled={!editingSegmentText.trim()}
                        >
                          确定并重新生成
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-ink-2 text-tau-body whitespace-pre-wrap leading-relaxed">
                      {line.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultPreview;
