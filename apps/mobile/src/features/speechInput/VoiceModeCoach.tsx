import { useCallback, useState } from "react";

const COACH_STORAGE_KEY = "tau.mobile.voice-mode-coach-seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

/** 配件栏语音切换键的首次引导：首次可见时显示一次，点任意处或用过语音后不再出现 */
export function useVoiceModeCoach(eligible: boolean) {
  const [seen, setSeen] = useState(readSeen);
  const dismiss = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(COACH_STORAGE_KEY, "1");
    } catch {
      // 存储不可用时只在本次会话内不再显示
    }
  }, []);
  return { visible: eligible && !seen, dismiss };
}

export function VoiceModeCoach(props: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      className="bg-ink-1 text-ink-inverse shadow-float absolute bottom-[calc(100%+10px)] left-0 z-10 rounded-[12px] px-3 py-2 text-[12.5px] whitespace-nowrap"
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
      onClick={props.onDismiss}
    >
      现在可以点这里，用说的输入
      <span
        aria-hidden
        className="bg-ink-1 absolute -bottom-[5px] left-[15px] h-2.5 w-2.5 rotate-45"
      />
    </button>
  );
}
