import { FileArchive } from "lucide-react";
import { FileDropZone } from "@tau/ui";

/** 插件 ZIP 拖放区：新建页与提交详情页共用同一套包要求说明 */
export function PackageDropZone({
  disabled,
  onFile,
}: {
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <FileDropZone
      accept=".zip"
      disabled={disabled}
      onFile={onFile}
      className="rounded-tau-lg bg-surface gap-2.5 py-10"
    >
      <span className="bg-accent-soft text-accent-text rounded-tau-md grid size-12 place-items-center">
        <FileArchive size={22} strokeWidth={1.7} />
      </span>
      <p className="text-tau-title text-ink-1 font-semibold">把插件 ZIP 拖到这里，或点击选择</p>
      <p className="text-tau-sm text-ink-3 leading-[1.7]">
        包内需要 manifest.json、README.md 和运行文件，16 MiB 以内
        <br />
        介绍与使用说明都读自 README，不用另外填写
      </p>
    </FileDropZone>
  );
}
