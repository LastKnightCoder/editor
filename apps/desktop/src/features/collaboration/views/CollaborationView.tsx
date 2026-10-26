/**
 * 协作页（mockups/collaboration/plan-a-desk.html · A3 侧栏嵌套定稿）。
 *
 * 会话目录不在页内：共享内容挂在全局侧栏「协作」之下（CollaborationNavSessions），
 * 页面是一整张纸：纸顶工具栏，纸内即协作副本（CollaborationRoom 不再自带卡片外壳）。
 * 当前内容 = 页面参数 id（缺省或失效时落到第一份）：正文在纸内编辑，白板展示协作信息；
 * 侧栏子项与 openPage("collaboration", { id }) 都经栈机原位更新参数。
 *
 * 工具栏：标题 + 摘要（份数 · 待处理申请，点开 Popover 就地批复）+ 昵称就地改 +
 * 输入协作码 + 共享本地内容。服务器地址不对用户开放，身份不导入导出。
 */

import { useState } from "react";
import { AlertTriangle, KeyRound, Share2, Users } from "lucide-react";
import type { SharedWhiteboardInfo } from "@tau/collaboration";
import { Button, Loading, Popover } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { JoinRequestItem } from "@/components/CollaborationUI";
import { pendingRequests } from "@/components/CollaborationUI/model";
import { resolveShared } from "../model";
import { CollaborationRoom } from "../components/CollaborationRoom";
import { WhiteboardRoom } from "../components/WhiteboardRoom";
import { JoinDialog } from "../components/JoinDialog";
import { NicknameChip } from "../components/NicknameChip";
import { ShareLocalDialog } from "../components/ShareLocalDialog";

const NO_WHITEBOARDS: SharedWhiteboardInfo[] = [];

export function CollaborationView() {
  const { navigator } = usePage();
  const { id } = usePageParams<{ id?: string }>();
  const synced = useCollaborationStore(state => state.synced);
  const sessions = useCollaborationStore(state => state.sessions);
  const whiteboards = useCollaborationStore(state => state.whiteboards ?? NO_WHITEBOARDS);
  const requests = useCollaborationStore(state => state.requests);
  const nickname = useCollaborationStore(state => state.nickname);
  const deviceId = useCollaborationStore(state => state.deviceId);
  const stateError = useCollaborationStore(state => state.error);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);

  const current = resolveShared(sessions, whiteboards, id);
  const pending = pendingRequests(requests);
  const select = (documentId?: string) =>
    navigator.push("collaboration", documentId ? { id: documentId } : {});

  if (!synced) return <Loading />;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      {/* 一整张纸：工具栏固定在纸顶，协作副本在纸内（同 Skill 页） */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mt-5 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-[600] tracking-[-0.01em] whitespace-nowrap">
            协作
          </h1>
          {sessions.length + whiteboards.length > 0 && (
            <div className="text-ink-2 text-tau-meta flex items-center gap-2">
              <span>
                <b className="text-ink-1 font-[600] tabular-nums">
                  {sessions.length + whiteboards.length}
                </b>{" "}
                份共享
              </span>
              {pending.length > 0 && (
                <>
                  <span className="text-ink-3">·</span>
                  <Popover
                    placement="bottom-start"
                    arrow={false}
                    className="w-[340px]"
                    trigger={
                      <button
                        type="button"
                        className="text-accent-text cursor-pointer hover:underline hover:underline-offset-[3px]"
                      >
                        {pending.length} 个申请待处理
                      </button>
                    }
                  >
                    <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
                      待审批
                    </Popover.Header>
                    <Popover.Body>
                      <div className="flex flex-col gap-1.5">
                        {pending.map(request => (
                          <JoinRequestItem
                            key={request.id}
                            request={request}
                            compact
                            className="bg-hover"
                            description={`申请加入「${
                              [...sessions, ...whiteboards].find(
                                item => item.id === request.documentId
                              )?.title || "未命名内容"
                            }」`}
                          />
                        ))}
                      </div>
                    </Popover.Body>
                  </Popover>
                </>
              )}
            </div>
          )}
          <span className="flex-1" />
          <NicknameChip deviceId={deviceId} nickname={nickname} />

          <Button variant="secondary" icon={KeyRound} onClick={() => setJoining(true)}>
            输入协作码
          </Button>
          <Button variant="primary" icon={Share2} onClick={() => setSharing(true)}>
            共享本地内容
          </Button>
        </div>

        {stateError && (
          <div
            role="status"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-md mx-8 mt-3 flex flex-none items-center gap-2.5 px-3.5 py-2"
          >
            <AlertTriangle className="size-3.5 flex-none" strokeWidth={1.75} />
            {stateError}
          </div>
        )}

        {current?.kind === "session" ? (
          <CollaborationRoom
            key={current.id}
            session={current.session}
            requests={requests}
            deviceId={deviceId}
            onLeft={() => select()}
          />
        ) : current?.kind === "whiteboard" ? (
          <WhiteboardRoom
            key={current.id}
            room={current.room}
            requests={requests}
            deviceId={deviceId}
          />
        ) : (
          <section className="grid flex-1 place-items-center">
            <div className="flex max-w-[34ch] flex-col items-center gap-2 text-center">
              <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
                <Users className="size-6" strokeWidth={1.5} />
              </span>
              <h2 className="text-ink-1 text-[15px] font-[600]">还没有协作内容</h2>
              <p className="text-ink-2 text-tau-meta">
                把一段本地内容或一块白板共享出去，或输入别人给你的协作码加入。文章、卡片、项目文档和白板里也能直接发起协作。
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  icon={KeyRound}
                  onClick={() => setJoining(true)}
                >
                  输入协作码
                </Button>
                {/* 工具栏已有一枚 primary，空态 CTA 降为 soft（每屏至多一枚 primary） */}
                <Button variant="soft" size="md" icon={Share2} onClick={() => setSharing(true)}>
                  共享本地内容
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>

      <JoinDialog open={joining} onOpenChange={setJoining} nickname={nickname} />
      <ShareLocalDialog
        open={sharing}
        onOpenChange={setSharing}
        sessions={sessions}
        whiteboards={whiteboards}
        onShared={select}
      />
    </div>
  );
}
