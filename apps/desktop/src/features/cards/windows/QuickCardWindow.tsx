/**
 * 快捷卡片窗口（路由 /quick-card，全局快捷键 ⌘⇧N 唤起的置顶窗）：新建一张闪念笔记，
 * 直接进入卡片编辑窗口（features/editor-window 的 EditorWindow，自动保存，无保存按钮）。
 *
 * 空卡片不留存：关窗时正文为空即删除；删除没来得及执行时，下次唤起复用这张空卡片而不是再建一张。
 */

import { useEffect, useRef, useState } from "react";
import { Button, Loading, ToastHost, initScrollbarAutoHide } from "@tau/ui";
import { ensureDatabaseReady } from "@/app/databaseReady";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import { EditorWindow } from "@/features/editor-window/EditorWindow";
import { EditorWindowTitlebar } from "@/features/editor-window/EditorWindowTitlebar";
import { WindowMessage } from "@/features/editor-window/WindowMessage";
import { DOCUMENT_DRIVERS } from "@/features/editor-window/documentDrivers";
import { useEditorDocument } from "@/features/editor-window/useEditorDocument";
import useSettingStore from "@/stores/useSettingStore";
import { deleteCard, getCardById } from "@/commands/card";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { getContentLength } from "@/utils";
import { ECardCategory } from "@/types";
import { useCardsMutations } from "../queries";
import "@/app/base.css";

// .app：base.css 作用域锚点（控件 reset / focus-ring / 滚动条）
const rootClass =
  "app flex h-screen flex-col overflow-hidden bg-page font-tau text-tau-body text-ink-1 antialiased";

const cardDriver = DOCUMENT_DRIVERS.card;

/** 上一次快捷新建的卡片，用于复用未写内容的空卡片 */
const LAST_CARD_KEY = "quick-card-last";

interface LastQuickCard {
  databaseName: string;
  id: number;
}

function readLastCard(databaseName: string): number | null {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_CARD_KEY) ?? "null") as LastQuickCard | null;
    return last?.databaseName === databaseName ? last.id : null;
  } catch {
    return null;
  }
}

async function findReusableCard(databaseName: string): Promise<number | null> {
  const id = readLastCard(databaseName);
  if (!id) return null;
  try {
    const card = await getCardById(id);
    return card && getContentLength(card.content) === 0 ? card.id : null;
  } catch {
    return null;
  }
}

type BootState =
  | { phase: "connecting" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; cardId: number };

export default function QuickCardWindow() {
  useThemeRuntime();
  useEffect(() => initScrollbarAutoHide(), []);

  const settingInited = useSettingStore(s => s.inited);
  const databaseName = useSettingStore(s => s.setting.database.active);
  const { create } = useCardsMutations();
  const createRef = useRef(create.mutateAsync);
  createRef.current = create.mutateAsync;
  const [boot, setBoot] = useState<BootState>({ phase: "connecting" });
  const [attempt, setAttempt] = useState(0);

  // 设置经 websocket 同步完成（App 根的 useSyncSetting）后才知道要连哪个库
  useEffect(() => {
    if (!settingInited) return;
    let alive = true;
    setBoot({ phase: "connecting" });
    void (async () => {
      let error = "";
      if (!(await ensureDatabaseReady(message => (error = message)))) {
        if (alive) setBoot({ phase: "failed", message: error || "未找到可用的数据库配置。" });
        return;
      }
      try {
        const cardId =
          (await findReusableCard(databaseName)) ??
          (
            await createRef.current({
              content: DEFAULT_CARD_CONTENT,
              tags: [],
              links: [],
              category: ECardCategory.Temporary,
              count: 0,
              isTop: false,
            })
          ).id;
        localStorage.setItem(LAST_CARD_KEY, JSON.stringify({ databaseName, id: cardId }));
        if (alive) setBoot({ phase: "ready", cardId });
      } catch (e) {
        if (alive)
          setBoot({ phase: "failed", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [settingInited, databaseName, attempt]);

  let body: React.ReactNode;
  if (boot.phase === "ready") {
    body = <QuickCardDocument cardId={boot.cardId} databaseName={databaseName} />;
  } else {
    body = (
      <>
        <EditorWindowTitlebar icon={cardDriver.icon} label={cardDriver.label} title="" />
        <div className="min-h-0 flex-1">
          {boot.phase === "connecting" ? (
            <Loading label="正在准备卡片…" />
          ) : (
            <WindowMessage
              title="无法新建卡片"
              description={boot.message}
              actions={<Button onClick={() => setAttempt(n => n + 1)}>重试</Button>}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className={rootClass}>
      {body}
      <ToastHost />
    </div>
  );
}

function QuickCardDocument({ cardId, databaseName }: { cardId: number; databaseName: string }) {
  const { document, status, saveState, updateFields } = useEditorDocument(cardDriver, cardId);
  const emptyRef = useRef(true);
  emptyRef.current = !document || getContentLength(document.content) === 0;

  // 关窗时空卡片即删；IPC 在渲染进程销毁前发出即可由主进程执行完
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!emptyRef.current) return;
      localStorage.removeItem(LAST_CARD_KEY);
      void deleteCard(cardId);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [cardId]);

  if (status === "ready" && document) {
    return (
      <EditorWindow
        driver={cardDriver}
        databaseName={databaseName}
        document={document}
        saveState={saveState}
        updateFields={updateFields}
        autoFocus
      />
    );
  }
  return (
    <>
      <EditorWindowTitlebar icon={cardDriver.icon} label={cardDriver.label} title="" />
      <div className="min-h-0 flex-1">
        {status === "loading" ? (
          <Loading />
        ) : (
          <WindowMessage
            title="卡片不存在或已被删除"
            description="它可能已在其它窗口被删除，或所在数据库已不可用。"
          />
        )}
      </div>
    </>
  );
}
