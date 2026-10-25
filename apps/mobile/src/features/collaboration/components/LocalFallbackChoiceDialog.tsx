import { useState } from "react";
import { BottomSheet } from "../../../components/BottomSheet";
import { toast } from "../../../components/toast";
import * as tauri from "../../../services/tauri";
import { collaborationManager } from "../core/manager";
import { clearPendingLocalFallback } from "../local-fallback";

export function LocalFallbackChoiceDialog(props: {
  open: boolean;
  documentId: string;
  boundContentId: number | undefined;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const adopt = async () => {
    setBusy(true);
    try {
      await collaborationManager.adoptRemote(props.documentId);
      if (props.boundContentId) clearPendingLocalFallback(props.boundContentId);
      props.onResolved();
    } catch (failure) {
      toast.error(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const exportLocal = async () => {
    setBusy(true);
    try {
      await collaborationManager.flushCache(props.documentId);
      const id = await tauri.preserveContentRecovery(props.documentId);
      toast.success(await tauri.exportContentRecovery(id));
    } catch (failure) {
      toast.error(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {props.open && dismissed && (
        <button className="text-accent-text p-3" onClick={() => setDismissed(false)}>
          处理本机恢复副本
        </button>
      )}
      <BottomSheet
        open={props.open && !dismissed}
        title="本机副本需要保全"
        onClose={() => {
          if (!busy) setDismissed(true);
        }}
      >
        <div className="space-y-3 px-4 pb-6">
          <p className="text-ink-2 text-sm">
            采用新版本前会独立保存原正文、协作缓存和可取得的附件。旧输入不会推回新房间，副本可在协作中心导出。旧格式须先在桌面完成转换。
          </p>
          <button
            disabled={busy}
            className="text-accent-text p-3"
            onClick={() => void exportLocal()}
          >
            导出本机副本
          </button>
          <button disabled={busy} className="text-accent-text p-3" onClick={() => void adopt()}>
            保全并采用新版本
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
