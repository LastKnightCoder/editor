import { ImagePlus, Trash2 } from "lucide-react";
import { Button, FileDropZone, IconButton } from "@tau/ui";
import { LIMITS } from "../../../../contracts";
import { Section } from "./Section";
import { UploadImage } from "./UploadImage";
import { UploadTaskCard } from "./UploadTaskCard";
import { isTaskActive, type UploadTasks } from "./useUploadTasks";
import { ACCEPT, formatBytes } from "./validation";

export function ImagesSection({
  iconUploadId,
  screenshotUploadIds,
  uploads,
  onIconSelect,
  onIconRemove,
  onScreenshotsSelect,
  onScreenshotRemove,
}: {
  iconUploadId: string | null;
  screenshotUploadIds: string[];
  uploads: UploadTasks;
  onIconSelect: (file: File) => void;
  onIconRemove: () => void;
  onScreenshotsSelect: (files: File[]) => void;
  onScreenshotRemove: (id: string) => void;
}) {
  const iconTasks = uploads.tasks.filter(task => task.kind === "icon");
  const shotTasks = uploads.tasks.filter(task => task.kind === "screenshot");
  const iconBusy = iconTasks.some(isTaskActive);
  const remaining =
    LIMITS.screenshots - screenshotUploadIds.length - shotTasks.filter(isTaskActive).length;
  const limit = formatBytes(LIMITS.imageBytes);

  return (
    <Section
      index={2}
      title="图标与截图"
      description={`图标必需，截图最多 ${LIMITS.screenshots} 张。支持 PNG、JPEG、WebP，单张不超过 ${limit}。`}
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-tau-meta text-ink-1 font-medium">
          图标
          <span className="text-danger ml-1" aria-label="必填">
            *
          </span>
        </h3>
        <div className="flex items-center gap-4">
          {iconUploadId ? (
            <UploadImage
              id={iconUploadId}
              alt="插件图标"
              className="border-line-1 size-20 border"
            />
          ) : null}
          {!iconBusy && (
            <div className="flex flex-col items-start gap-2">
              {iconUploadId ? (
                <div className="flex gap-2">
                  <FileDropZone accept={ACCEPT.icon} onFile={onIconSelect} className="px-3 py-1.5">
                    <span className="text-tau-sm text-ink-1">更换图标</span>
                  </FileDropZone>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={onIconRemove}>
                    移除
                  </Button>
                </div>
              ) : (
                <FileDropZone
                  accept={ACCEPT.icon}
                  onFile={onIconSelect}
                  className="size-20 px-2 py-2"
                >
                  <ImagePlus size={18} strokeWidth={1.6} className="text-ink-3" />
                  <span className="text-tau-micro text-ink-2">选择图标</span>
                </FileDropZone>
              )}
              <p className="text-tau-micro text-ink-3">建议正方形，至少 256 × 256</p>
            </div>
          )}
        </div>
        {iconTasks.map(task => (
          <UploadTaskCard key={task.key} task={task} uploads={uploads} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-tau-meta text-ink-1 font-medium">
          截图
          <span className="text-ink-3 ml-2 font-normal">
            {screenshotUploadIds.length} / {LIMITS.screenshots}
          </span>
        </h3>
        {screenshotUploadIds.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {screenshotUploadIds.map((id, index) => (
              <li key={id} className="group relative">
                <UploadImage
                  id={id}
                  alt={`截图 ${index + 1}`}
                  className="border-line-1 aspect-[16/10] w-full border"
                />
                <IconButton
                  aria-label={`移除截图 ${index + 1}`}
                  onClick={() => onScreenshotRemove(id)}
                  className="bg-surface shadow-card absolute right-1.5 top-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {shotTasks.map(task => (
          <UploadTaskCard key={task.key} task={task} uploads={uploads} />
        ))}
        {remaining > 0 && (
          <FileDropZone accept={ACCEPT.screenshot} onFiles={onScreenshotsSelect} className="py-4">
            <ImagePlus size={18} strokeWidth={1.6} className="text-ink-3" />
            <p className="text-tau-sm text-ink-1">添加截图（还可添加 {remaining} 张）</p>
          </FileDropZone>
        )}
      </div>
    </Section>
  );
}
