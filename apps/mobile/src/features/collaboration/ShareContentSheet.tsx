// 发起共享（设计稿 05 方案 A 入口 + B 结果卡）：详情页点「发起协作」后弹出，
// 生成完成原位切换为结果卡——协作码 + 复制 + 进入协作编辑。
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import { toast } from "../../components/toast";
import { useNavigator } from "../../router";
import { parseInvokeError } from "../../services/errors";
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
  onClose: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const navigator = useNavigator();
  const [phase, setPhase] = useState<"sharing" | "done" | "error">("sharing");
  const [result, setResult] = useState<ShareResult>();
  const [message, setMessage] = useState<string>();
  const started = useRef(false);
  // 发起可能发生在从未进过协作页的会话：挂载即以用户配置启动运行时，
  // 否则 manager 未启动时会误用默认服务器地址
  useCollaborationRuntime();

  const run = async () => {
    setPhase("sharing");
    setMessage(undefined);
    try {
      const { collaborationManager } = await import("./core/manager");
      const content = props.content ?? (await tauri.getContentDetail(props.contentId)).content;
      const shared = await collaborationManager.shareContent({
        contentId: props.contentId,
        title: props.title,
        content,
        bannerBg: props.bannerBg,
        bannerPosition: props.bannerPosition,
        sourceType: props.sourceType,
        sourceId: props.sourceId,
      });
      setResult(shared);
      setPhase("done");
    } catch (failure) {
      const parsed = parseInvokeError(failure);
      setMessage(parsed.message || "发起协作失败，请稍后重试");
      setPhase("error");
      props.onError(failure, "发起协作失败");
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
      .then(() => toast.success("协作码已复制"))
      .catch(() => toast.warning("复制失败"));
  };

  return (
    <BottomSheet open={props.open} title="发起协作" onClose={props.onClose}>
      {phase === "sharing" ? (
        <div className="flex flex-col items-center pb-2 pt-4">
          <Loader2 size={34} className="text-accent animate-spin" />
          <p className="text-ink-1 mt-4 text-[16px] font-extrabold">正在创建协作房间…</p>
          <p className="text-ink-2 mt-2 text-center text-[12.5px] leading-relaxed">
            正在把「{props.title}」发布到协作服务器
            <br />
            白板、数据库等私有块保留在本机，不会上传
          </p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-col items-center pb-2 pt-4">
          <p className="text-ink-1 text-[16px] font-extrabold">发起协作失败</p>
          <p className="text-ink-2 mt-2 text-center text-[12.5px] leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => void run()}
            className="bg-page text-ink-2 mt-5 flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold"
          >
            <RefreshCw size={16} /> 重试
          </button>
        </div>
      ) : null}

      {phase === "done" && result ? (
        <>
          <div className="bg-tag-1-soft text-tag-1 mx-auto grid h-[60px] w-[60px] place-items-center rounded-full">
            <Check size={30} strokeWidth={2.6} />
          </div>
          <p className="text-ink-1 mt-3.5 text-center text-[17px] font-extrabold">已开启协作</p>
          <p className="text-ink-2 mt-1 text-center text-[12px]">
            把协作码发给伙伴，对方申请后由你批准
          </p>
          <div className="mt-4">
            <CollabCodeCard code={result.code} expiresAt={result.expiresAt} onCopy={copy} />
          </div>
          <div className="bg-page text-ink-2 mt-3.5 flex gap-2.5 rounded-[14px] px-3.5 py-3 text-[11.5px] leading-relaxed">
            <span className="flex-1">
              本卡片已切换为协作模式 · 编辑实时同步 · 你是作者，可随时在成员管理中结束共享
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              props.onClose();
              navigator.push("collabEditor", { documentId: result.documentId });
            }}
            className="border-line-1 text-ink-1 mt-3.5 w-full rounded-full border-[1.6px] py-3 text-[14px] font-bold"
          >
            进入协作编辑
          </button>
        </>
      ) : null}
    </BottomSheet>
  );
}
