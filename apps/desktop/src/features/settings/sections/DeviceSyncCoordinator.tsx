/** 协调端：状态句 + 添加设备；配对引导就地展开，对方配对后自动收起；设备是两列行式列表 */

import { useCallback, useState, type ReactNode } from "react";
import {
  Clock,
  Ellipsis,
  Laptop,
  MonitorSmartphone,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { Button, ConfirmDialog, IconButton, Menu, Spinner, toast } from "@tau/ui";
import {
  formatSince,
  SCOPE_TEXT,
  usePeerJoined,
  useRemaining,
  type DeviceSyncModel,
  type DeviceSyncStatus,
} from "./deviceSyncModel";
import {
  CodeField,
  Failure,
  PreservedCopies,
  SectionHead,
  StatusBand,
  Steps,
} from "./deviceSyncParts";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

export function CoordinatorView({
  model,
  status,
}: {
  model: DeviceSyncModel;
  status: DeviceSyncStatus;
}) {
  const { pairing, setPairing } = model;
  const [revoking, setRevoking] = useState<DeviceSyncStatus["peers"][number]>();
  const paused = !status.enabled;
  const count = status.peers.length;
  const since = formatSince(status.lastSync);
  usePeerJoined(
    status.peers,
    useCallback(
      (name: string) => {
        toast.success(`「${name}」已配对`);
        setPairing(undefined);
      },
      [setPairing]
    )
  );

  const band = paused ? (
    <StatusBand
      tone="idle"
      icon={Pause}
      title="局域网连接已暂停"
      subtitle={
        count
          ? `${count} 台已配对设备暂时连不上本机，各自仍可编辑；恢复后自动补齐。`
          : "恢复后才能添加设备。"
      }
      actions={
        <Button
          variant="primary"
          icon={Play}
          loading={model.enable.isPending}
          loadingText="正在恢复…"
          onClick={() =>
            model.enable.mutate(undefined, { onSuccess: () => toast.success("已恢复局域网连接") })
          }
        >
          恢复连接
        </Button>
      }
    />
  ) : (
    <StatusBand
      tone="ok"
      icon={Network}
      title={`本机正在协调「${status.database}」`}
      subtitle={
        count
          ? `已配对 ${count} 台设备${since ? ` · 最近收到修改 ${since}` : ""}`
          : "还没有配对的设备，先添加一台"
      }
      actions={
        <>
          {pairing ? (
            <Button variant="ghost" onClick={() => setPairing(undefined)}>
              收起
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={Plus}
              loading={model.generate.isPending}
              loadingText="正在生成…"
              onClick={() => model.generate.mutate()}
            >
              添加设备
            </Button>
          )}
          <Menu
            align="end"
            trigger={
              <IconButton aria-label="协调电脑的更多操作">
                <Ellipsis {...ICON} />
              </IconButton>
            }
          >
            <Menu.Item icon={<Pause {...ICON} />} onSelect={() => model.pause.mutate()}>
              暂停局域网连接
            </Menu.Item>
          </Menu>
        </>
      }
    />
  );

  return (
    <>
      {band}
      <Failure
        error={model.generate.error ?? model.pause.error ?? model.enable.error ?? status.error}
        className="mt-3"
      />
      <PreservedCopies status={status} />
      {pairing && !paused && (
        <PairingPanel
          code={pairing.code}
          expires={pairing.expires}
          regenerating={model.generate.isPending}
          onRegenerate={() =>
            model.generate.mutate(undefined, {
              onSuccess: () => toast.success("已生成新的配对信息，之前那份已失效"),
            })
          }
        />
      )}
      {count > 0 && (
        <section className="mt-6">
          <SectionHead title="已配对的设备" note={`${count} 台 · 不必同时在线`} />
          <ul className={`grid grid-cols-2 gap-x-5 gap-y-0.5 ${paused ? "opacity-60" : ""}`}>
            <PeerRow icon={Laptop} name="这台电脑" detail="协调中" self />
            {status.peers.map(peer => (
              <PeerRow
                key={peer.id}
                icon={MonitorSmartphone}
                name={peer.name}
                detail="已配对"
                menu={
                  <Menu
                    align="end"
                    trigger={
                      <IconButton aria-label={`${peer.name} 的更多操作`}>
                        <Ellipsis {...ICON} />
                      </IconButton>
                    }
                  >
                    <Menu.Item
                      danger
                      icon={<Unlink {...ICON} />}
                      onSelect={() => setRevoking(peer)}
                    >
                      解除配对…
                    </Menu.Item>
                  </Menu>
                }
              />
            ))}
          </ul>
        </section>
      )}
      <div className="text-tau-meta text-ink-2 mt-8 grid grid-cols-2 gap-6">
        <div>
          <div className="text-ink-1 mb-0.5 font-semibold">同步什么</div>
          {SCOPE_TEXT}
        </div>
        <div>
          <div className="text-ink-1 mb-0.5 font-semibold">设备连不上时</div>
          <ul className="list-disc pl-4">
            <li>两台设备连着同一个局域网</li>
            <li>这台电脑上的 Tau 正在运行、没有暂停连接</li>
            <li>防火墙放行 Tau（端口 24721）</li>
          </ul>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={open => !open && setRevoking(undefined)}
        title="解除这台设备的配对"
        context={revoking?.name}
        danger
        description={
          <>
            <p className="text-tau-body text-ink-2">
              解除后它不能再与本机同步。它上面已经保存的资料不会被删除；以后想恢复，重新添加一次即可。
            </p>
            <Failure error={model.revoke.error} className="mt-2" />
          </>
        }
        confirmText="解除配对"
        loadingText="正在解除…"
        onConfirm={async () => {
          if (!revoking) return;
          await model.revoke.mutateAsync(revoking.id);
          toast.success(`已解除「${revoking.name}」的配对`);
        }}
      />
    </>
  );
}

function PeerRow(props: {
  icon: typeof Laptop;
  name: string;
  detail: string;
  self?: boolean;
  menu?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <li className="hover:bg-hover rounded-tau-md flex min-h-12 items-center gap-3 py-2 pr-1.5 pl-2">
      <span
        className={`grid size-8 flex-none place-items-center rounded-[10px] ${props.self ? "bg-accent-soft text-accent-text" : "bg-hover text-ink-2"}`}
      >
        <Icon {...ICON} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-tau-body text-ink-1 block truncate font-medium">{props.name}</span>
        <span className="text-tau-sm text-ink-3 block">{props.detail}</span>
      </span>
      {props.menu}
    </li>
  );
}

function PairingPanel(props: {
  code: string;
  expires: number;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  const remaining = useRemaining(props.expires);
  const expired = remaining <= 0;
  const until = new Date(props.expires).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="border-line-1 rounded-tau-lg mt-[18px] border px-[18px] pt-[18px] pb-3.5">
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <span className="text-tau-body text-ink-1 font-semibold">添加一台设备</span>
        <span className="text-tau-meta text-ink-3">
          每份配对信息只给一台设备，只发给你自己的设备
        </span>
      </div>
      <Steps
        columns
        items={[
          {
            title: "在那台设备打开同步设置",
            detail: (
              <>
                电脑：设置 → 同步 → 设备同步
                <br />
                手机：设置 → 同步
              </>
            ),
          },
          { title: "复制下面的配对信息", detail: "经隔空投送、备忘录或自己的聊天工具发过去" },
          { title: "在那台设备粘贴并配对", detail: "完成后这里会自动收起，设备出现在列表里" },
        ]}
      />
      <div className="mt-3.5">
        <CodeField code={props.code} expired={expired} />
      </div>
      <div className="text-tau-meta text-ink-2 mt-2.5 flex min-h-7 items-center gap-4">
        {expired ? (
          <span className="text-warn inline-flex items-center gap-1.5">
            <Clock size={14} strokeWidth={1.75} aria-hidden />
            已过期。重新生成一份即可，之前那份不能再用。
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} strokeWidth={1.75} aria-hidden />
              {until} 前有效
            </span>
            <span className="text-ink-3 inline-flex items-center gap-1.5">
              <Spinner className="size-3" />
              等待那台设备配对…
            </span>
          </>
        )}
        <span className="ml-auto">
          <Button
            variant={expired ? "primary" : "ghost"}
            size="sm"
            icon={RefreshCw}
            loading={props.regenerating}
            loadingText="正在生成…"
            onClick={props.onRegenerate}
          >
            重新生成
          </Button>
        </span>
      </div>
    </div>
  );
}
