import { Captions } from "lucide-react";
import BottomSheet from "../../../components/BottomSheet";
import { useOptionalPageInstanceContext } from "../../../router/pageLifecycle";
import { closeTranscriptionUnavailable, useTranscriptionUnavailable } from "./transcription";

/** 识别服务不能整段识别（未配置、只支持实时、账号未开通）时引导去设置 */
export function TranscriptionUnavailableSheet() {
  const unavailable = useTranscriptionUnavailable();
  // 工具栏也挂在不在页面栈里的编辑器上（如浮层），没有导航时只关闭
  const navigator = useOptionalPageInstanceContext()?.navigator;
  const openSettings = () => {
    closeTranscriptionUnavailable();
    navigator?.push("settingsModule", { module: "speech-input" });
  };
  return (
    <BottomSheet open={unavailable !== null} onClose={closeTranscriptionUnavailable}>
      <div className="bg-surface mx-3.5 mt-1 rounded-2xl px-5 pt-6 pb-5 text-center">
        <div className="bg-accent-soft text-accent-text mx-auto mb-3 flex size-13 items-center justify-center rounded-2xl">
          <Captions size={24} />
        </div>
        <h3 className="mb-1.5 text-[16px] font-semibold">{unavailable?.title}</h3>
        <p className="text-ink-3 text-[12.5px] leading-relaxed">{unavailable?.reason}</p>
      </div>
      <div className="flex gap-2.5 px-3.5 pt-3.5 pb-2">
        <button
          type="button"
          className="bg-surface text-ink-1 h-12 rounded-[14px] px-4 text-[15.5px] font-semibold"
          onClick={closeTranscriptionUnavailable}
        >
          取消
        </button>
        <button
          type="button"
          className="bg-accent text-ink-inverse h-12 flex-1 rounded-[14px] text-[15.5px] font-semibold"
          onClick={openSettings}
        >
          去设置
        </button>
      </div>
    </BottomSheet>
  );
}
