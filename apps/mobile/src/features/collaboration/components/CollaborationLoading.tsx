// 协作页面共用的懒加载兜底：协作核心（yjs / hocuspocus）位于动态 chunk，
// 首次进入协作功能时加载，避免把协作运行时打进主 bundle。
import { Loader2 } from "lucide-react";
import { useJoinCollaborationI18n } from "../join.i18n";

export function CollaborationLoading() {
  const { t } = useJoinCollaborationI18n();
  return (
    <div className="bg-page text-ink-3 flex h-full items-center justify-center gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-[13px]">{t("loading")}</span>
    </div>
  );
}
