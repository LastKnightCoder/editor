// 全局新建入口的动作与「长按直接说」：底部 Dock 与左侧导航条共用，
// 两处只负责各自的按钮与菜单形态。

import { diaryTranslator } from "../features/diary/i18n";
import { useEffect, useRef } from "react";
import type { Icon } from "@phosphor-icons/react";
import { useRouterContext } from "../router";
import { useAppContext } from "../app/AppContext";
import { useDiaryStore } from "../features/diary/store/useDiaryStore";
import { getTodayDateKey } from "../features/diary/feedUtils";
import { useInvalidateArticles } from "../features/articles/queries";
import * as tauri from "../services/tauri";
import { useHoldGesture } from "../features/speechInput/useHoldGesture";
import { useVoiceCapture } from "../features/speechInput/useVoiceCapture";
import { VoiceCaptureCard } from "../features/speechInput/VoiceCaptureCard";

export type QuickCreateKey = "card" | "article" | "calendar" | "diary" | "voice";

export type QuickCreateAction = {
  key: QuickCreateKey;
  label: string;
  icon: Icon;
};

type QuickCreateOptions = {
  /** 轻点新建按钮（未达到长按时长）：由各自形态开合菜单 */
  onTap: () => void;
  /** 长按开始录音前收起菜单 */
  onHoldStart: () => void;
  /** 识别卡片距屏幕底的位置 */
  captureBottom: string;
};

export function useQuickCreate(options: QuickCreateOptions) {
  const { navigator } = useRouterContext();
  const app = useAppContext();
  const invalidateArticles = useInvalidateArticles();

  const run = (key: QuickCreateKey) => {
    if (key === "card") {
      navigator.push("quickCapture");
      return;
    }
    if (key === "voice") {
      navigator.push("quickCapture", { voice: true });
      return;
    }
    if (key === "calendar") {
      // 预填今天：新建页自行取本地 0 点
      navigator.push("calendarEventEdit", { eventId: 0, prefillDate: Date.now() });
      return;
    }
    if (key === "article") {
      void (async () => {
        try {
          const article = await tauri.articleCreate({ title: "无标题文章" });
          invalidateArticles();
          navigator.push("articleEditor", { articleId: article.id });
        } catch (error) {
          app.presentError(error, "新建文章失败");
        }
      })();
      return;
    }
    void (async () => {
      try {
        const baseDate = getTodayDateKey();
        // 快捷创建语义：每次进入都开始一个新片段（当天无日记建首段、空片段复用）
        const contentId = await useDiaryStore.getState().startNewSegment("daily", baseDate);
        if (typeof contentId !== "number" || !Number.isFinite(contentId) || contentId <= 0) {
          throw new Error("DIARY_CONTENT_NOT_FOUND");
        }
        navigator.push("contentDetail", {
          contentId,
          contentTitle: "",
          fromDiary: true,
          diaryDate: { mode: "daily", baseDate: baseDate },
        });
      } catch (error) {
        app.presentError(error, diaryTranslator.t("open.failed"));
      }
    })();
  };

  const openSpeechSettings = () => navigator.push("settingsModule", { module: "speech-input" });
  const capture = useVoiceCapture({
    onOpen: cardId => navigator.push("contentDetail", { cardId }),
    onSaved: () => void app.refreshCardsSafe({ page: 1 }),
    onOpenSettings: openSpeechSettings,
  });
  const cancelTargetRef = useRef<HTMLDivElement | null>(null);
  const holdStartedRef = useRef(false);
  const gesture = useHoldGesture(
    {
      onHoldStart: () => {
        options.onHoldStart();
        holdStartedRef.current = capture.begin();
        if (!holdStartedRef.current) gesture.abort();
      },
      onRelease: () => {
        if (holdStartedRef.current) capture.finish();
        holdStartedRef.current = false;
      },
      onCancel: () => {
        if (holdStartedRef.current) capture.cancel();
        holdStartedRef.current = false;
      },
      onTap: options.onTap,
    },
    cancelTargetRef
  );
  const { setCancelArmed } = capture;
  useEffect(() => setCancelArmed(gesture.cancelArmed), [gesture.cancelArmed, setCancelArmed]);
  const holding = gesture.holding && holdStartedRef.current;

  const captureCard = (
    <VoiceCaptureCard
      open={holding}
      connecting={capture.phase === "connecting"}
      startedAt={capture.startedAt}
      preview={capture.preview}
      cancelArmed={capture.cancelArmed}
      cancelTargetRef={cancelTargetRef}
      bottom={options.captureBottom}
    />
  );

  /** 新建按钮的手势绑定，pointer 事件与长按样式（防选中、防系统菜单） */
  const fabBind = {
    style: gesture.bind.style,
    onPointerDown: gesture.bind.onPointerDown,
    onMouseDown: gesture.bind.onMouseDown,
    onContextMenu: gesture.bind.onContextMenu,
  };

  return { run, holding, fabBind, captureCard };
}
