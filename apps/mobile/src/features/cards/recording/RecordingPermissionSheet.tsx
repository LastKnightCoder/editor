import { useRecordingI18n } from "./recording.i18n";
import { MicOff } from "lucide-react";
import BottomSheet from "../../../components/BottomSheet";
import { toast } from "../../../components/toast";
import { openRecordingSettings } from "../../../services/recording";

/** 麦克风权限被拒：系统不会再弹授权框，只能引导去系统设置 */
export function RecordingPermissionSheet(props: { open: boolean; onClose: () => void }) {
  const { t } = useRecordingI18n();
  const openSettings = () => {
    props.onClose();
    void openRecordingSettings().catch(error =>
      toast.error(error instanceof Error ? error.message : t("permission.failed"))
    );
  };
  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <div className="bg-surface mx-3.5 mt-1 rounded-2xl px-5 pt-6 pb-5 text-center">
        <div className="bg-danger-soft text-danger mx-auto mb-3 flex size-13 items-center justify-center rounded-2xl">
          <MicOff size={24} />
        </div>
        <h3 className="mb-1.5 text-[16px] font-semibold">{t("permission.title")}</h3>
        <p className="text-ink-3 text-[12.5px] leading-relaxed">{t("permission.hint")}</p>
      </div>
      <div className="flex gap-2.5 px-3.5 pt-3.5 pb-2">
        <button
          type="button"
          className="bg-surface text-ink-1 h-12 rounded-[14px] px-4 text-[15.5px] font-semibold"
          onClick={props.onClose}
        >
          {t("action.cancel")}
        </button>
        <button
          type="button"
          className="bg-accent text-ink-inverse h-12 flex-1 rounded-[14px] text-[15.5px] font-semibold"
          onClick={openSettings}
        >
          {t("permission.open")}
        </button>
      </div>
    </BottomSheet>
  );
}
