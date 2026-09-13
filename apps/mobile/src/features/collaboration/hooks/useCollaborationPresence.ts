// 本机活动状态上报已下沉共享包（与桌面端共用同一实现）：
// 写入 awareness 的 activity 字段，服务端白名单 activity 后聚合成房间级 presence。
export { useCollaborationPresence as default } from "@tau/collaboration/src/view";
