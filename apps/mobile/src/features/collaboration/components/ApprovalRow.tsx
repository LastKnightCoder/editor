// 待审批行：协作中心与成员管理 Sheet 共用（头像 + 申请文案 + 拒绝/批准）。
import { Avatar } from "./CollaborationUI";
import type { JoinRequest } from "@tau/collaboration";

export function ApprovalRow(props: {
  request: JoinRequest;
  busy?: boolean;
  /** 副文案按场景区分：列表页说明收益，成员 Sheet 说明来源 */
  hint?: string;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-[11px]">
      <Avatar id={props.request.deviceId} name={props.request.nickname} />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block truncate text-[14px] font-semibold">
          {props.request.nickname} 申请加入
        </span>
        <span className="text-ink-3 mt-0.5 block text-[11.5px]">
          {props.hint ?? "批准后即可实时协同编辑"}
        </span>
      </span>
      <button
        type="button"
        disabled={props.busy}
        onClick={() => props.onDecide(false)}
        className="bg-tag-5-soft text-tag-5 shrink-0 rounded-full px-3.5 py-[7px] text-[12.5px] font-bold disabled:opacity-50"
      >
        拒绝
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={() => props.onDecide(true)}
        className="bg-tag-1-soft text-tag-1 shrink-0 rounded-full px-3.5 py-[7px] text-[12.5px] font-bold disabled:opacity-50"
      >
        批准
      </button>
    </div>
  );
}
