// 发起共享：详情页点「发起协作」后弹出，
// 生成完成原位切换为结果卡——协作码 + 复制 + 进入协作编辑。
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import { toast } from "../../components/toast";
import { useNavigator } from "../../router";
import { useRoomI18n, roomTranslator, roomFailureText } from "./room.i18n";
import * as tauri from "../../services/tauri";
import { CollabCodeCard } from "./components/CollaborationUI";
import { useCollaborationRuntime } from "./hooks/useCollaborationRuntime";

type ShareResult = { documentId: string; code: string; expiresAt: number };

export function ShareContentSheet(props: {
  open: boolean;
  contentId: number;
  title: string;
  /** 正文（Slate 树）；缺省时按 contentId 现取（知识库/项目文档条目只带 contentId） */
  content?: unknown[];
  bannerBg?: string;
  bannerPosition?: string;
  sourceType?: string;
  sourceId?: number;
  guard?: () => void;
  expectedRef?: string;
  onClose: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const { t } = useRoomI18n();
  const navigator = useNavigator();
  const [phase, setPhase] = useState<"sharing" | "done" | "error">("sharing");
  const [result, setResult] = useState<ShareResult>();
  const [failure, setFailure] = useState<{ cause: unknown }>();
  const started = useRef(false);
  // 只有打开面板才持有运行时，关闭后的退场组件不再触发启动。
  useCollaborationRuntime(props.open);

  const run = async () => {
    setPhase("sharing");
    setFailure(undefined);
    try {
      const { collaborationManager } = await import("./core/manager");
      props.guard?.();
      const content = props.content ?? (await tauri.getContentDetail(props.contentId)).content;
      props.guard?.();
      const shared = await collaborationManager.shareContent(
        {
          contentId: props.contentId,
          title: props.title,
          content,
          bannerBg: props.bannerBg,
          bannerPosition: props.bannerPosition,
          sourceType: props.sourceType,
          sourceId: props.sourceId,
        },
        props.guard,
        props.expectedRef
      );
      props.guard?.();
      setResult(shared);
      setPhase("done");
    } catch (failure) {
      try {
        props.guard?.();
      } catch {
        return;
      }
      setFailure({ cause: failure });
      setPhase("error");
      props.onError(failure, roomTranslator.t("share.failed"));
    }
  };

  // 每次打开只发起一次；关闭后重开走新的流程
  useEffect(() => {
    if (!props.open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const copy = () => {
    if (!result) return;
    void window.navigator.clipboard
      .writeText(result.code)
      .then(() => toast.success(roomTranslator.t("code.copied")))
      .catch(() => toast.warning(roomTranslator.t("code.copyFailed")));
  };

  return (
    <BottomSheet open={props.open} title={t("share.title")} onClose={props.onClose}>
      {phase === "sharing" ? (
        <div className="flex flex-col items-center pt-4 pb-2">
          <Loader2 size={34} className="text-accent animate-spin" />
          <p className="text-ink-1 mt-4 text-[16px] font-extrabold">{t("share.creating")}</p>
          <p className="text-ink-2 mt-2 text-center text-[12.5px] leading-relaxed">
            {t("share.uploading", { title: props.title })}
            <br />
            {t("share.private")}
          </p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-col items-center pt-4 pb-2">
          <p className="text-ink-1 text-[16px] font-extrabold">{t("share.failed")}</p>
          <p className="text-ink-2 mt-2 text-center text-[12.5px] leading-relaxed" role="alert">
            {failure ? roomFailureText(failure.cause, "share.failureHint") : t("share.failureHint")}
          </p>
          <button
            type="button"
            onClick={() => void run()}
            className="bg-page text-ink-2 mt-5 flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold"
          >
            <RefreshCw size={16} /> {t("share.retry")}
          </button>
        </div>
      ) : null}

      {phase === "done" && result ? (
        <>
          <div className="bg-tag-1-soft text-tag-1 mx-auto grid h-[60px] w-[60px] place-items-center rounded-full">
            <Check size={30} strokeWidth={2.6} />
          </div>
          <p className="text-ink-1 mt-3.5 text-center text-[17px] font-extrabold">
            {t("share.done")}
          </p>
          <p className="text-ink-2 mt-1 text-center text-[12px]">{t("share.invite")}</p>
          <div className="mt-4">
            <CollabCodeCard code={result.code} expiresAt={result.expiresAt} onCopy={copy} />
          </div>
          <div className="bg-page text-ink-2 mt-3.5 flex gap-2.5 rounded-[14px] px-3.5 py-3 text-[11.5px] leading-relaxed">
            <span className="flex-1">{t("share.ownerHint")}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              props.onClose();
              navigator.push("collabEditor", { documentId: result.documentId });
            }}
            className="border-line-1 text-ink-1 mt-3.5 w-full rounded-full border-[1.6px] py-3 text-[14px] font-bold"
          >
            {t("share.enter")}
          </button>
        </>
      ) : null}
    </BottomSheet>
  );
}
