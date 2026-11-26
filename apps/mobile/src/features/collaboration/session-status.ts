// 会话状态推导与瞬时同步延迟由共享包提供；这里只转出原始状态，宿主在展示时翻译。
export {
  sessionStatus,
  useStableSessionStatus,
  type SessionStatus,
  type SessionStatusKind,
  type SessionTone,
} from "@tau/collaboration/src/view";
