/** 分享面板（作者：协作码 + 申请 + 成员；成员：成员）——协作页 Popover 与内容页对话框共用 */

import type { CollaborationSession, JoinRequest } from "@tau/collaboration";
import { InvitationCode } from "./InvitationCode";
import { JoinRequestItem } from "./JoinRequestItem";
import { MemberList } from "./MemberList";
import { SectionTitle } from "./SectionTitle";
import { othersSummary, pendingRequests } from "./model";

export function SharePanel({
  session,
  requests,
  deviceId,
}: {
  session: CollaborationSession;
  requests: JoinRequest[];
  deviceId?: string;
}) {
  const pending = pendingRequests(requests, session.id);
  const ownerActive = session.role === "owner" && session.status === "active";
  return (
    <div className="flex flex-col gap-5">
      {ownerActive && <InvitationCode session={session} />}
      {ownerActive && pending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionTitle count={pending.length}>待审批</SectionTitle>
          {pending.map(request => (
            <JoinRequestItem key={request.id} request={request} className="bg-hover" />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <SectionTitle
          count={session.members.length}
          aside={session.status === "active" ? othersSummary(session, deviceId) : undefined}
        >
          成员
        </SectionTitle>
        <MemberList session={session} deviceId={deviceId} />
      </div>
    </div>
  );
}
