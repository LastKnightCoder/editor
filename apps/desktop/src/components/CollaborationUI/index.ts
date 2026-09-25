/**
 * 协作 UI 共享件（应用级共享层）：协作页与内容页的分享对话框共用同一套头像、状态、
 * 协作码、成员与申请组件，协作页的成员 Popover 与内容页 Dialog 只是容器不同。
 * 一组件一文件（同 packages/ui/primitives 惯例），此处只做桶导出；纯函数在 model.ts，
 * 协作码查询缓存在 useInvitation.ts。
 */

export { Avatar } from "./Avatar";
export { AvatarStack } from "./AvatarStack";
export { StatusDot } from "./StatusDot";
export { SessionStatus } from "./SessionStatus";
export { SectionTitle } from "./SectionTitle";
export { InvitationCode } from "./InvitationCode";
export { MemberList } from "./MemberList";
export { JoinRequestItem } from "./JoinRequestItem";
export { SharePanel } from "./SharePanel";
export { LeaveDialog } from "./LeaveDialog";
