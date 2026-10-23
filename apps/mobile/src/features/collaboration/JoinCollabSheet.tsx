// 加入协作（设计稿 02 方案 A + B 融合）：分格码输入 + 剪贴板一键填入 + 等待批准态。
import { useEffect, useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import type { JoinRequestResult } from "@tau/collaboration";
import { BottomSheet } from "../../components/BottomSheet";
import { useNavigator } from "../../router";
import { parseInvokeError } from "../../services/errors";
import { collaborationManager } from "./core/manager";
import { useCollaborationStore } from "./core/store";
import { isCompleteJoinCode, JoinCodeInput, sanitizeJoinCode } from "./components/JoinCodeInput";

function errorText(error: unknown, fallback: string) {
  const parsed = parseInvokeError(error);
  return parsed.message || fallback;
}

export function JoinCollabSheet(props: {
  onClose: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const navigator = useNavigator();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<JoinRequestResult>();
  const [clipboardCode, setClipboardCode] = useState<string>();

  // 进面板时探测一次剪贴板：只接受合法且完整的协作码，其余静默忽略（尊重系统剪贴板权限）
  useEffect(() => {
    let disposed = false;
    void window.navigator.clipboard
      ?.readText()
      .then(text => {
        const candidate = sanitizeJoinCode(text ?? "");
        if (!disposed && isCompleteJoinCode(candidate)) setClipboardCode(candidate);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  // 批准检测：申请响应自带 documentId，批准即该文档出现在会话列表（已是成员时提交后刷新即命中）。
  const approvedDocumentId = useCollaborationStore(state =>
    pending ? state.sessions.find(session => session.id === pending.documentId)?.id : undefined
  );
  useEffect(() => {
    if (!approvedDocumentId) return;
    navigator.replace("collabEditor", { documentId: approvedDocumentId });
  }, [approvedDocumentId, navigator]);

  const submit = async () => {
    if (!isCompleteJoinCode(code) || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const request = await collaborationManager.joinByCode(code);
      setPending(request);
    } catch (failure) {
      setError(errorText(failure, "加入协作失败，请检查协作码"));
      props.onError(failure, "加入协作失败");
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <BottomSheet open title="等待作者批准" onClose={props.onClose}>
        <p className="text-ink-2 -mt-1 mb-4 text-center text-[12.5px] leading-relaxed">
          申请已提交，作者同意后会自动进入文档
        </p>
        <div className="bg-tag-4-soft flex items-center gap-3 rounded-[18px] p-4">
          <Loader2 size={22} className="text-warn shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="text-ink-1 text-[14px] font-bold">已发起加入申请</p>
            <p className="text-ink-2 mt-0.5 text-[12px]">
              通常几分钟内完成 · 也可以先返回，批准后我会通知你
            </p>
          </div>
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={props.onClose}
            className="bg-page text-ink-2 flex-1 rounded-full py-3 text-[14px] font-bold"
          >
            先去忙别的
          </button>
        </div>
        <div className="bg-page text-ink-2 mt-4 rounded-[14px] p-3 text-[12px] leading-relaxed">
          <b className="text-ink-1">申请被拒绝或协作码过期？</b>
          <br />
          协作码 7 天有效且轮换后旧码立即失效；被拒后需向作者索取新码重新申请。
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open title="加入协作" onClose={props.onClose}>
      <p className="text-ink-2 -mt-1 mb-4 text-center text-[12.5px]">
        输入作者分享给你的 12 位协作码
      </p>
      {clipboardCode && clipboardCode !== code ? (
        <div className="bg-tag-1-soft mb-3.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5">
          <ClipboardPaste size={17} className="text-tag-1 shrink-0" />
          <span className="text-ink-1 min-w-0 flex-1 truncate text-[12.5px]">
            剪贴板检测到协作码 <b className="font-mono tracking-[0.05em]">{clipboardCode}</b>
          </span>
          <button
            type="button"
            onClick={() => setCode(clipboardCode)}
            className="bg-tag-1 text-ink-inverse shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold"
          >
            填入
          </button>
        </div>
      ) : null}
      <JoinCodeInput value={code} onChange={setCode} disabled={busy} />
      <p className="text-ink-3 mt-2.5 text-center text-[11.5px] leading-relaxed">
        协作码 7 天有效 · 由房间作者在「成员管理」中生成
      </p>
      {error ? (
        <p className="text-tag-5 mt-2 text-center text-[12px] leading-relaxed">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={!isCompleteJoinCode(code) || busy}
        onClick={() => void submit()}
        className="shadow-lift text-ink-inverse mt-4 w-full rounded-full py-3.5 text-[15px] font-extrabold transition-transform active:scale-[0.97] disabled:opacity-45 disabled:shadow-none"
        style={{ background: "var(--tau-accent)" }}
      >
        {busy ? "提交中…" : "申请加入"}
      </button>
    </BottomSheet>
  );
}
