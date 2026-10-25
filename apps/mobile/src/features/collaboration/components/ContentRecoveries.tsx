import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "../../../components/BottomSheet";
import { toast } from "../../../components/toast";
import * as tauri from "../../../services/tauri";

export function ContentRecoveries() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["content-recoveries"],
    queryFn: tauri.listContentRecoveries,
    enabled: open,
    refetchOnWindowFocus: true,
  });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await query.refetch();
    } catch (failure) {
      toast.error(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="text-accent-text px-4 py-3" onClick={() => setOpen(true)}>
        本机恢复副本
      </button>
      <BottomSheet open={open} title="本机恢复副本" onClose={() => setOpen(false)}>
        <div className="space-y-3 px-4 pb-6">
          <p className="text-ink-2 text-sm">
            旧数据请在桌面完成转换。副本按操作范围保留必要正文、协作缓存、输入草稿和可取得的附件，采用新版本不会删除副本。
          </p>
          {query.error && <p role="alert">{String(query.error)}</p>}
          {query.isPending && <p>正在读取…</p>}
          {query.data?.map(item => (
            <div key={item.id} className="border-line-1 rounded-xl border p-3">
              <p className="text-ink-2 text-sm break-all">
                {item.workspace ?? "恢复副本"} · {item.id}
              </p>
              {item.error && <p role="alert">{item.error}</p>}
              {!!item.missing?.length && (
                <details>
                  <summary>{item.missing.length} 个资源尚未取得</summary>
                  {item.missing.map((value, index) => (
                    <p key={index} className="text-xs break-all">
                      {value}
                    </p>
                  ))}
                </details>
              )}
              <button
                disabled={busy || !!item.error}
                className="text-accent-text py-2"
                onClick={() =>
                  void run(async () => {
                    toast.success(`已导出：${await tauri.exportContentRecovery(item.id)}`);
                  })
                }
              >
                导出恢复包
              </button>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
