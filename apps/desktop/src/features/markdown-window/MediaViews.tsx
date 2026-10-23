import { useState, type SyntheticEvent } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button, cn, toast } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import { openFileWithDefaultApp, showInFolder } from "@/commands";
import { revealInFileManagerLabel } from "@/platform";
import { baseName, splitExtension } from "./paths";
import { FileStatusBar } from "./FileChrome";

const typeLabel = (path: string) =>
  splitExtension(baseName(path)).ext.slice(1).toUpperCase() || "文件";

const revealButton = (path: string) => (
  <button
    type="button"
    onClick={() => void showInFolder(path)}
    className="hover:bg-hover hover:text-ink-1 rounded-[6px] px-1.5 py-px transition-colors"
  >
    {revealInFileManagerLabel}
  </button>
);

const CHECKER_BG = {
  background:
    "repeating-conic-gradient(var(--tau-bg-hover) 0% 25%, transparent 0% 50%) 50% / 18px 18px",
};

/** 图片 / 音视频预览。
    适应窗口：行列轨道必须是 minmax(0,1fr)——隐式 auto 轨道按媒体原始尺寸撑开，子元素 max-h/max-w-full
    的百分比失去参照，大图溢出只能滚动；定尺轨道下才能等比缩放。
    原始尺寸：回到 auto 轨道 + m-auto 居中（auto margin 是「安全」居中，超出时从左上角可滚，不被裁掉） */
export function MediaView({ path, type }: { path: string; type: "image" | "video" | "audio" }) {
  const [fit, setFit] = useState(true);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const isImage = type === "image";
  const actual = isImage && !fit;

  return (
    <>
      <div
        className={cn(
          "grid min-h-0 flex-1 p-8",
          actual
            ? "overflow-auto"
            : "grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden"
        )}
        style={isImage ? CHECKER_BG : undefined}
      >
        {isImage && (
          <LocalImage
            url={path}
            title="双击切换适应窗口 / 原始尺寸"
            onLoad={(event: SyntheticEvent<HTMLImageElement>) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onDoubleClick={() => setFit(value => !value)}
            className={cn(
              "rounded-tau-sm shadow-card",
              actual
                ? "m-auto max-w-none cursor-zoom-out"
                : "max-h-full max-w-full cursor-zoom-in object-contain"
            )}
          />
        )}
        {type === "video" && (
          <LocalVideo src={path} controls className="rounded-tau-md max-h-full max-w-full" />
        )}
        {type === "audio" && <LocalAudio src={path} controls />}
      </div>
      <FileStatusBar
        trailing={
          <>
            {isImage && (
              <div className="bg-hover flex gap-0.5 rounded-[7px] p-0.5" role="radiogroup">
                {([true, false] as const).map(value => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={fit === value}
                    onClick={() => setFit(value)}
                    className={cn(
                      "h-[18px] rounded-[5px] px-1.5 transition-colors",
                      fit === value ? "bg-surface text-ink-1 shadow-card" : "hover:text-ink-1"
                    )}
                  >
                    {value ? "适应窗口" : "原始尺寸"}
                  </button>
                ))}
              </div>
            )}
            {revealButton(path)}
          </>
        }
      >
        <span>{typeLabel(path)}</span>
        {isImage && natural && (
          <span>
            {natural.width} × {natural.height}
          </span>
        )}
      </FileStatusBar>
    </>
  );
}

/** PDF / Office 等：交给系统默认应用 */
export function ExternalFileView({ path }: { path: string }) {
  const open = async () => {
    const failure = await openFileWithDefaultApp(path);
    if (failure) toast.error(`打开失败：${failure}`);
  };
  return (
    <>
      <div className="text-tau-meta text-ink-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <FileText className="text-ink-3 mb-1 size-10" strokeWidth={1.25} />
        <span className="text-ink-1">{baseName(path)}</span>
        <span>该格式不能在这里编辑</span>
        <Button className="mt-2" onClick={() => void open()}>
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
          用默认应用打开
        </Button>
      </div>
      <FileStatusBar trailing={revealButton(path)}>
        <span>{typeLabel(path)}</span>
      </FileStatusBar>
    </>
  );
}
