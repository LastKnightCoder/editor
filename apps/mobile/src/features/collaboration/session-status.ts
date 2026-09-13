// 会话状态推导已下沉共享包（与桌面端共用同一实现，含瞬时同步延迟揭示的修复）：
// 状态文案是列表徽标、编辑页顶栏与离线横幅的唯一来源，两端必须同一措辞。
export {
  sessionStatus,
  sessionStatusLabel,
  useStableSessionStatus,
  type SessionStatus,
  type SessionTone,
} from "@tau/collaboration/src/view";
