import { useCallback, useRef, useState } from "react";
import classNames from "classnames";
import { Volume2, FileText, RefreshCw, Pause } from "lucide-react";
import { Button, SectionTitle, TextArea, TextStrong, TextSecondary } from "./ui";
import { formatTime } from "./utils";
import type { PodcastScriptLine } from "@/types/podcast";
import { extractPodcastSegment } from "@/commands/podcast-audio";
import { remoteResourceToLocal } from "@/utils/resouce";
import { getHomeDir, readBinaryFile } from "@/commands/file";

export interface ResultPreviewProps {
  audioUrl: string;
  duration: number;
  scriptLines: PodcastScriptLine[];
  segmentAudios: Blob[];
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

      if (segmentAudios[index]) {
        const audio = new Audio(URL.createObjectURL(segmentAudios[index]));
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
    <div className="space-y-4">
      <SectionTitle>
        <Volume2 size={14} className="-mt-px mr-1.5 inline-block" /> 播客音频
      </SectionTitle>
      <audio key={audioUrl} controls className="w-full" src={audioUrl} />
      <TextSecondary className="text-xs">
        时长: {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, "0")}
      </TextSecondary>

      <details open className="mt-4">
        <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400">
          <FileText size={14} className="inline-block" /> 查看脚本
        </summary>
        <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto pt-3">
          {scriptLines.map((line, index) => {
            const isEditing = editingSegmentIndex === index;
            const isRegenerating = regeneratingSegmentIndex === index;
            const isExtracting = extractingAudioIndex === index;
            const isPlaying = playingSegmentIndex === index;

            return (
              <div
                key={index}
                className={classNames(
                  "rounded-lg p-3 transition-colors duration-150",
                  isEditing
                    ? "bg-[var(--th-accent-soft)] shadow-[0_0_0_1px_rgba(59,130,246,0.3)]"
                    : isRegenerating
                      ? "bg-amber-50 shadow-[0_0_0_1px_rgba(245,158,11,0.3)] dark:bg-amber-500/10"
                      : "bg-gray-50 shadow-[0_0_0_1px_rgba(34,42,53,0.06)] hover:shadow-[0_0_0_1px_rgba(34,42,53,0.12)] dark:bg-zinc-800/50 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.04)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TextStrong>{line.speaker}</TextStrong>
                    <TextSecondary className="text-xs">
                      {formatTime(line.startTime)} - {formatTime(line.startTime + line.duration)} (
                      {line.duration.toFixed(1)}s)
                    </TextSecondary>
                    {isRegenerating && (
                      <TextSecondary className="text-xs text-yellow-700 dark:text-yellow-400">
                        正在重新生成...
                      </TextSecondary>
                    )}
                  </div>
                  {!isEditing && !isRegenerating && (
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        variant={isPlaying ? "primary" : "text"}
                        icon={isPlaying ? <Pause size={14} /> : <Volume2 size={14} />}
                        loading={isExtracting}
                        onClick={() => handlePlaySegment(index)}
                      >
                        {isPlaying ? "停止试听" : "试听"}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        icon={<RefreshCw size={14} />}
                        onClick={() => handleStartEditSegment(index, line.text)}
                      >
                        重生成
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <TextArea
                      value={editingSegmentText}
                      onChange={setEditingSegmentText}
                      autoSize={{ minRows: 2, maxRows: 8 }}
                      autoFocus
                      placeholder="请输入文本内容"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="small" onClick={handleCancelEditSegment}>
                        取消
                      </Button>
                      <Button
                        size="small"
                        variant="primary"
                        onClick={handleConfirmEditSegment}
                        disabled={!editingSegmentText.trim()}
                      >
                        确定并重新生成
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-200">
                    {line.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
};

export default ResultPreview;
