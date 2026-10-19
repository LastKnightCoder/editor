import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import type { PackageManifest, Upload } from "../../../../contracts";
import { formatBytes } from "./validation";

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-tau-micro text-ink-3">{label}</dt>
      <dd
        className={
          mono ? "text-tau-sm text-ink-1 font-tau-mono truncate" : "text-tau-sm text-ink-1 truncate"
        }
      >
        {children}
      </dd>
    </div>
  );
}

/** 包内 manifest 与文件摘要：只读，修改需重新打包上传 */
export function PackageFacts({
  manifest,
  upload,
}: {
  manifest: PackageManifest;
  upload: Upload | null;
}) {
  const files = Object.entries(manifest.integrity);
  const runtime = "main" in manifest ? manifest : undefined;
  const template = "template" in manifest ? manifest.template : undefined;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-tau-sm text-ok inline-flex items-center gap-1.5">
        <ShieldCheck size={15} strokeWidth={1.9} />
        静态校验通过
        <span className="text-ink-3">· 仅代表包格式与摘要正确，不代表代码审核</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Fact label="插件 ID" mono>
          {manifest.id}
        </Fact>
        <Fact label="名称">{manifest.name}</Fact>
        <Fact label="版本" mono>
          {manifest.version}
        </Fact>
        <Fact label="最低应用版本" mono>
          {manifest.minAppVersion}
        </Fact>
        <Fact label="入口" mono>
          {template ? `${template.root}/ · ${template.entries.join("、")}` : runtime?.main}
          {runtime?.styles ? ` · ${runtime.styles}` : ""}
        </Fact>
        <Fact label="格式">
          {manifest.platform} ·{" "}
          {template ? `静态模板 ${template.protocolVersion}` : runtime?.format} · format{" "}
          {manifest.formatVersion} / api {manifest.apiVersion}
        </Fact>
        {upload && (
          <Fact label="文件">
            {upload.fileName} · {formatBytes(upload.size)}
          </Fact>
        )}
        {upload?.sha256 && (
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5">
            <dt className="text-tau-micro text-ink-3">SHA-256</dt>
            <dd className="text-tau-sm text-ink-1 font-tau-mono break-all">{upload.sha256}</dd>
          </div>
        )}
      </dl>
      <details className="group">
        <summary className="text-tau-sm text-ink-2 hover:text-ink-1 w-fit cursor-pointer select-none">
          完整性清单（{files.length} 个文件）
        </summary>
        <ul className="border-line-1 rounded-tau-sm divide-line-1 mt-2 flex flex-col divide-y border">
          {files.map(([file, hash]) => (
            <li key={file} className="flex min-w-0 gap-3 px-3 py-2">
              <span className="text-tau-sm text-ink-1 font-tau-mono shrink-0">{file}</span>
              <span className="text-tau-micro text-ink-3 font-tau-mono min-w-0 truncate">
                {hash}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
