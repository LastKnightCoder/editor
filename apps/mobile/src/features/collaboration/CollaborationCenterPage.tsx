// 协作中心（设计稿 01 方案 A）：身份卡 + 待审批 + 我发起的 / 我加入的 分组会话列表。
import { useRef, useState } from "react";
import { FileText, Loader2, Settings, UserPlus } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { CollaborationSession } from "@tau/collaboration";
import { GroupLabel } from "../../components/GroupLabel";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useNavigator } from "../../router";
import { collaborationManager } from "./core/manager";
import { useCollaborationStore } from "./core/store";
import { sessionStatus } from "./session-status";
import { Avatar, AvatarStack, StatusDot } from "./components/CollaborationUI";
import { ApprovalRow } from "./components/ApprovalRow";

function SessionRow(props: { session: CollaborationSession; onOpen: () => void }) {
  const status = sessionStatus(props.session);
  const online = props.session.members.filter(member => member.online);
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="active:bg-press flex w-full items-center gap-3 px-4 py-[11px] text-left transition-colors"
    >
      <span className="bg-apricot-soft text-apricot grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px]">
        <FileText size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[14px] font-semibold">
          {props.session.title}
        </span>
        <span className="text-ink-3 mt-0.5 flex items-center gap-1.5 text-[11.5px]">
          <StatusDot tone={status.tone} />
          <span className={status.tone === "live" ? "text-sage" : undefined}>
            {status.tone === "live" ? `${status.label} · ${online.length} 人在线` : status.label}
          </span>
        </span>
      </span>
      {online.length > 0 ? <AvatarStack members={online} /> : null}
      <ChevronRight size={16} className="text-ink-3 shrink-0" />
    </button>
  );
}

/** 一个分组（标题 + 会话卡片列表）；「我发起的 / 我加入的」共用 */
function SessionGroup(props: {
  title: string;
  sessions: CollaborationSession[];
  onOpen: (documentId: string) => void;
}) {
  if (props.sessions.length === 0) return null;
  return (
    <>
      <GroupLabel inset="page" className="font-medium">
        {props.title} · {props.sessions.length}
      </GroupLabel>
      <div className="bg-surface shadow-card divide-line-soft mx-4 mb-4 divide-y overflow-hidden rounded-[22px]">
        {props.sessions.map(session => (
          <SessionRow key={session.id} session={session} onOpen={() => props.onOpen(session.id)} />
        ))}
      </div>
    </>
  );
}

export function CollaborationCenterPage(props: {
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const sessions = useCollaborationStore(state => state.sessions);
  const requests = useCollaborationStore(state => state.requests);
  const serverUrl = useCollaborationStore(state => state.serverUrl);
  const nickname = useCollaborationStore(state => state.nickname);
  const deviceId = useCollaborationStore(state => state.deviceId);
  const status = useCollaborationStore(state => state.status);
  const error = useCollaborationStore(state => state.error);

  const owned = sessions.filter(session => session.role === "owner");
  const joined = sessions.filter(session => session.role !== "owner");

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = async (requestId: string, approve: boolean, nickname: string) => {
    if (decidingId) return;
    setDecidingId(requestId);
    try {
      await collaborationManager.decideJoinRequest(requestId, approve);
      toast.success(approve ? `已批准 ${nickname}` : `已拒绝 ${nickname}`);
    } catch (failure) {
      props.onError(failure, approve ? "批准加入失败" : "拒绝加入失败");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="bg-page flex h-full flex-col">
      <PageHeader
        title="协作"
        onBack={props.onBack}
        actions={
          <>
            <PageHeaderButton
              icon={<Settings size={20} />}
              aria-label="协作设置"
              onClick={() => navigator.push("settingsModule", { module: "collaboration" })}
            />
            <PageHeaderButton
              variant="brand"
              icon={<UserPlus size={20} />}
              aria-label="加入协作"
              onClick={() => navigator.push("joinSheet")}
            />
          </>
        }
      />
      <div ref={scrollRef} className="edge-fade-scroll scrollbar-hide flex-1 overflow-y-auto pb-8">
        {/* 身份摘要：设备即身份，颜色与协作中的头像/光标一致 */}
        <button
          type="button"
          onClick={() => navigator.push("settingsModule", { module: "collaboration" })}
          className="bg-surface shadow-card active:bg-press mx-4 mb-4 mt-1.5 flex w-[calc(100%-2rem)] items-center gap-3 rounded-[20px] p-4 text-left transition-colors"
        >
          <Avatar id={deviceId ?? "local"} name={nickname} size="lg" online={status === "ready"} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-ink text-[15.5px] font-extrabold">{nickname}</span>
              {status === "starting" ? (
                <span className="text-ink-3 flex items-center gap-1 text-[11px]">
                  <Loader2 size={11} className="animate-spin" /> 连接中
                </span>
              ) : null}
            </span>
            <span className="text-ink-3 mt-1 block truncate text-[11.5px]">
              {serverUrl.replace(/^https?:\/\//, "")}
              {" · "}
              <span className={status === "ready" ? "text-sage" : "text-rose"}>
                {status === "ready" ? "已连接" : status === "error" ? "连接异常" : "未连接"}
              </span>
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" />
        </button>

        {error ? (
          <div className="bg-rose-soft text-rose mx-4 mb-4 rounded-[16px] px-4 py-3 text-[12.5px] leading-relaxed">
            {error}
          </div>
        ) : null}

        {requests.length > 0 ? (
          <>
            <GroupLabel inset="page" tone="warn" className="font-medium">
              待审批 · {requests.length}
            </GroupLabel>
            <div className="bg-surface shadow-card divide-line-soft mx-4 mb-4 divide-y overflow-hidden rounded-[22px]">
              {requests.map(request => (
                <ApprovalRow
                  key={request.id}
                  request={request}
                  busy={decidingId === request.id}
                  onDecide={approve => void decide(request.id, approve, request.nickname)}
                />
              ))}
            </div>
          </>
        ) : null}

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center px-10 pt-14 text-center">
            <span className="bg-accent-soft text-accent grid h-[64px] w-[64px] place-items-center rounded-[22px]">
              <UserPlus size={28} strokeWidth={1.8} />
            </span>
            <p className="text-ink mt-5 text-[16px] font-extrabold">还没有协作</p>
            <p className="text-ink-2 mt-2 text-[13px] leading-relaxed">
              输入伙伴分享的协作码加入，
              <br />
              或从卡片详情发起共享
            </p>
            <button
              type="button"
              onClick={() => navigator.push("joinSheet")}
              className="shadow-accent mt-6 rounded-full px-7 py-3 text-[14px] font-extrabold text-white active:scale-[0.97]"
              style={{ backgroundImage: "var(--brand-grad)" }}
            >
              加入协作
            </button>
          </div>
        ) : (
          <>
            <SessionGroup
              title="我发起的"
              sessions={owned}
              onOpen={documentId => navigator.push("collabEditor", { documentId })}
            />
            <SessionGroup
              title="我加入的"
              sessions={joined}
              onOpen={documentId => navigator.push("collabEditor", { documentId })}
            />
          </>
        )}
      </div>
    </div>
  );
}
