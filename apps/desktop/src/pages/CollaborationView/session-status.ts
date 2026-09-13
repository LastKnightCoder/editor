// 会话状态推导已下沉共享包（与移动端共用同一实现）。此处随包版本一并获得
// 瞬时同步的 effect 依赖修复：高频广播下「正在同步」徽标此前可能被无限推迟揭示。
export {
  sessionStatus,
  sessionStatusLabel,
  useStableSessionStatus,
  type SessionStatus,
  type SessionTone,
} from "@tau/collaboration/src/view";
