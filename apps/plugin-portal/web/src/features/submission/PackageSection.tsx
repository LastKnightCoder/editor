import { FileArchive } from "lucide-react";
import { FileDropZone, Spinner } from "@tau/ui";
import { LIMITS, type PackageManifest } from "../../../../contracts";
import { Notice } from "../../components/Notice";
import { PackageFacts } from "./PackageFacts";
import { Section } from "./Section";
import { UploadTaskCard } from "./UploadTaskCard";
import { useUploadRecord } from "./uploadQueries";
import { isTaskActive, type UploadTasks } from "./useUploadTasks";
import { ACCEPT, formatBytes } from "./validation";

function CurrentPackage({
  uploadId,
  fallback,
}: {
  uploadId: string;
  fallback: PackageManifest | null;
}) {
  const record = useUploadRecord(uploadId);
  const upload = record.data ?? null;
  if (upload?.status === "checking") {
    return (
      <p className="text-tau-sm text-ink-2 flex items-center gap-2">
        <Spinner /> 服务端正在校验 {upload.fileName}…
      </p>
    );
  }
  if (upload?.status === "invalid") {
    return (
      <Notice tone="danger" title="插件包未通过校验">
        {upload.error?.message ?? "请重新打包上传"}
      </Notice>
    );
  }
  const manifest = upload?.manifest ?? fallback;
  if (manifest) return <PackageFacts manifest={manifest} upload={upload} />;
  if (record.isError) {
    return (
      <Notice tone="warn" title="无法读取插件包信息">
        {record.error.message}
      </Notice>
    );
  }
  return (
    <p className="text-tau-sm text-ink-3 flex items-center gap-2">
      <Spinner /> 读取包信息…
    </p>
  );
}

export function PackageSection({
  packageUploadId,
  savedManifest,
  savedPackageUploadId,
  uploads,
  onSelect,
}: {
  packageUploadId: string | null;
  savedManifest: PackageManifest | null;
  savedPackageUploadId: string | null;
  uploads: UploadTasks;
  onSelect: (file: File) => void;
}) {
  const tasks = uploads.tasks.filter(task => task.kind === "package");
  const busy = tasks.some(isTaskActive);
  return (
    <Section
      index={1}
      title="插件包"
      description="上传构建好的插件 ZIP。包信息读取自 manifest，只读；修改 ID、名称或版本需要重新打包。"
    >
      {packageUploadId && (
        <CurrentPackage
          uploadId={packageUploadId}
          fallback={packageUploadId === savedPackageUploadId ? savedManifest : null}
        />
      )}
      {tasks.map(task => (
        <UploadTaskCard key={task.key} task={task} uploads={uploads} />
      ))}
      {!busy && (
        <FileDropZone
          accept={ACCEPT.package}
          onFile={onSelect}
          className={packageUploadId ? "py-4" : undefined}
        >
          <FileArchive size={20} strokeWidth={1.6} className="text-ink-3" />
          <p className="text-tau-sm text-ink-1">
            {packageUploadId ? "更换插件包" : "拖入或点击选择插件 ZIP"}
          </p>
          <p className="text-tau-micro text-ink-3">
            单层 &lt;pluginId&gt;/ 根目录，不超过 {formatBytes(LIMITS.zipBytes)}
            ；服务端会检查结构、manifest 与完整性摘要
          </p>
        </FileDropZone>
      )}
    </Section>
  );
}
