/**
 * 协作离线：左右两台设备编辑同一篇。右侧（林夏）可以断网：断网后两边各写各的，
 * 林夏这边出现「离线中，改动已保存在本机，恢复连接后自动合并。」；重新连上后两边的改动合到一起。
 * 离线横幅与成员摘要按 features/collaboration 的 CollaborationRoom 与 CollaborationUI/model 重建，
 * 头像按 CollaborationUI/Avatar（成员色 + 活动点）。
 */
import { useState, type ReactNode } from "react";
import { Plus, WifiOff } from "lucide-react";
import { Switch, cn } from "@tau/ui";

interface Line {
  id: number;
  author: "me" | "lin";
  text: string;
}

const BASE: Line[] = [
  {
    id: 1,
    author: "me",
    text: "这次讨论的主题：怎样在碎片化的一天里留出整块时间。",
  },
];

const MY_LINES = [
  "我的做法是每天上午九点到十一点关掉消息。",
  "周五下午留给浅层工作：回邮件、整理待办。",
];
const LIN_LINES = [
  "我试过时间块，最难的是第一周坚持下来。",
  "可以把整块时间写进日程，当成会议一样对待。",
];

const MEMBER = {
  me: { name: "我", initial: "我", color: "var(--tau-tag-2)" },
  lin: { name: "林夏", initial: "林", color: "var(--tau-tag-4)" },
};

function Avatar({ who, online }: { who: "me" | "lin"; online: boolean }) {
  const member = MEMBER[who];
  return (
    <span
      className={cn(
        "ring-surface relative inline-grid size-[22px] place-items-center rounded-full text-[11px] font-semibold ring-2",
        !online && "opacity-55 grayscale-[0.85]"
      )}
      style={{
        color: member.color,
        background: `color-mix(in oklch, ${member.color} 16%, transparent)`,
      }}
      title={`${member.name} · ${online ? "正在编辑" : "离线"}`}
    >
      {member.initial}
      {online && (
        <i className="bg-ok ring-surface absolute -right-px -bottom-px size-[7px] rounded-full ring-2" />
      )}
    </span>
  );
}

function Device({
  who,
  lines,
  online,
  peerOnline,
  pending,
  onWrite,
  canWrite,
  extra,
}: {
  who: "me" | "lin";
  lines: Line[];
  online: boolean;
  peerOnline: boolean;
  pending: boolean;
  onWrite: () => void;
  canWrite: boolean;
  extra?: ReactNode;
}) {
  const both = online && peerOnline;
  return (
    <div className="border-line-1 bg-surface shadow-card flex min-w-0 flex-1 flex-col rounded-[16px] border">
      <div className="flex h-11 items-center gap-2 px-4">
        <span className="text-ink-3 text-tau-tiny font-semibold tracking-[0.12em]">
          {who === "me" ? "你的电脑" : "林夏的电脑"}
        </span>
        <span className="flex-1" />
        <span className="flex -space-x-1.5">
          <Avatar who="me" online={who === "me" || both} />
          <Avatar who="lin" online={who === "lin" || both} />
        </span>
        <span className="text-tau-meta text-ink-2">{both ? "1 人正在编辑" : "只有你在"}</span>
      </div>
      {extra}
      {!online && (
        <div
          role="status"
          className="bg-warn-soft text-warn rounded-tau-md text-tau-meta animate-doc-in mx-4 mb-1 flex items-center gap-2.5 py-2 pr-2 pl-3.5"
        >
          <WifiOff className="size-3.5 flex-none" strokeWidth={1.75} />
          {pending
            ? "离线中，改动已保存在本机，恢复连接后自动合并。"
            : "离线中，暂时看不到其他成员的改动。"}
        </div>
      )}
      <div className="flex-1 px-5 pt-2 pb-3">
        <p className="text-tau-title font-semibold">读书会：Deep Work 讨论</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {lines.map(line => (
            <p
              key={line.id}
              className="animate-doc-in border-l-2 pl-2.5 text-[13.5px] leading-[1.75]"
              style={{ borderColor: MEMBER[line.author].color }}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4">
        <button
          type="button"
          disabled={!canWrite}
          onClick={onWrite}
          className="border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed text-[13px] disabled:opacity-40"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          {canWrite ? "写一句" : "这边写完了"}
        </button>
      </div>
    </div>
  );
}

export default function CollabOfflineDemo() {
  const [linOnline, setLinOnline] = useState(true);
  /** 每台设备本机看到的内容 */
  const [mine, setMine] = useState<Line[]>(BASE);
  const [lins, setLins] = useState<Line[]>(BASE);
  const [myCount, setMyCount] = useState(0);
  const [linCount, setLinCount] = useState(0);
  /** 林夏离线时写下、尚未同步的行 */
  const [linPending, setLinPending] = useState<Line[]>([]);
  /** 林夏离线期间你写下、她还没收到的行 */
  const [myUnseen, setMyUnseen] = useState<Line[]>([]);

  const write = (who: "me" | "lin") => {
    if (who === "me") {
      const line: Line = {
        id: 100 + myCount,
        author: "me",
        text: MY_LINES[myCount],
      };
      setMyCount(myCount + 1);
      setMine(list => [...list, line]);
      if (linOnline) setLins(list => [...list, line]);
      else setMyUnseen(list => [...list, line]);
    } else {
      const line: Line = {
        id: 200 + linCount,
        author: "lin",
        text: LIN_LINES[linCount],
      };
      setLinCount(linCount + 1);
      setLins(list => [...list, line]);
      if (linOnline) setMine(list => [...list, line]);
      else setLinPending(list => [...list, line]);
    }
  };

  const reconnect = (on: boolean) => {
    setLinOnline(on);
    if (!on) return;
    // 恢复连接：双方各自未收到的行合并进来，按写下的先后排列
    setMine(list => [...list, ...linPending].sort((a, b) => order(a) - order(b)));
    setLins(list => [...list, ...myUnseen].sort((a, b) => order(a) - order(b)));
    setLinPending([]);
    setMyUnseen([]);
  };

  // 合并后的顺序：按示例里两人交替写下的时间先后
  const order = (line: Line) =>
    line.id < 100 ? 0 : line.id < 200 ? (line.id - 100) * 2 + 1 : (line.id - 200) * 2 + 2;

  return (
    <div className="font-tau text-tau-body text-ink-1 flex gap-4 select-none max-md:flex-col">
      <Device
        who="me"
        lines={mine}
        online
        peerOnline={linOnline}
        pending={false}
        onWrite={() => write("me")}
        canWrite={myCount < MY_LINES.length}
      />
      <Device
        who="lin"
        lines={lins}
        online={linOnline}
        peerOnline
        pending={linPending.length > 0}
        onWrite={() => write("lin")}
        canWrite={linCount < LIN_LINES.length}
        extra={
          <label className="text-tau-sm text-ink-2 mx-4 mb-2 flex items-center gap-2">
            <Switch
              size="sm"
              checked={!linOnline}
              aria-label="断网"
              onCheckedChange={off => reconnect(!off)}
            />
            断网
          </label>
        }
      />
    </div>
  );
}
