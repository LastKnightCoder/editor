import { toast } from "@tau/ui";
import type { CenterVersion } from "../../../../contracts";
import { errorMessage } from "../../api/errors";
import { saveBlob } from "../../components/saveBlob";
import { useCenterDownload } from "./center-queries";

/** 下载指定版本 ZIP 并交给浏览器保存；跨端包只能经 v2 下载。 */
export function useZipSave() {
  const download = useCenterDownload();
  return {
    pending: download.isPending,
    save: (pluginId: string, version: Pick<CenterVersion, "releaseId" | "version">) =>
      download.mutate(version.releaseId, {
        onSuccess: blob => saveBlob(blob, `${pluginId}-${version.version}.zip`),
        onError: error => toast.error(`下载失败：${errorMessage(error)}`),
      }),
  };
}
