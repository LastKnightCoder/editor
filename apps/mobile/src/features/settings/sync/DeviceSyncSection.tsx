// 局域网设备同步（手机只做连接端）：状态卡在上；未配对时三步说明 + 拇指区「粘贴配对信息」，
// 配对后只留一句状态 +「立即补齐」。覆盖在「恢复」组，经底部面板确认一次；暂停与解除配对在协调电脑上操作。

import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock,
  Database,
  Download,
  Files,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Smartphone,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  describeDeviceSyncError,
  previewDevicePairCode,
} from "@tau/collaboration/src/device-sync/messages";
import { BottomSheet } from "../../../components/BottomSheet";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { GroupCard, GroupNote } from "../components/ui";
import { ActionButton } from "../storage/fields";
import {
  downloadDeviceLibrary,
  getDeviceSyncStatus,
  pairDevice,
  subscribeDeviceSyncStatus,
} from "../../../services/device-sync/runtime";
import { deviceSyncDatabase, wakeDeviceSync } from "../../../services/device-sync/native";
import { formatRelativeTime } from "./syncState";

const PAIR_PREFIX = "tau-pair:v1:";
const OVERWRITE_LOSES = [
  "未同步到协调电脑的本机修改",
  "待同步任务、草稿与缓存",
  "撤销记录；正在编辑的页面会重新载入",
];

type Tone = "ok" | "warn" | "danger" | "accent" | "idle";
const LEAD_TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent-text",
  idle: "bg-hover text-ink-2",
};

function StatusCard(props: {
  tone: Tone;
  icon: LucideIcon;
  spinning?: boolean;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <GroupCard>
      <div className="px-4 py-[18px]">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 flex-none place-items-center rounded-full ${LEAD_TONE[props.tone]}`}
          >
            <Icon
              size={20}
              strokeWidth={1.9}
              aria-hidden="true"
              className={props.spinning ? "animate-spin [animation-duration:1.4s]" : undefined}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-tau-title text-ink-1 leading-snug font-semibold">{props.title}</p>
            {props.children && (
              <div className="text-tau-meta text-ink-2 mt-1 leading-relaxed">{props.children}</div>
            )}
          </div>
        </div>
        {props.footer && <div className="mt-3.5 flex gap-2">{props.footer}</div>}
      </div>
    </GroupCard>
  );
}

/** 单行卡：图标块 + 标题/说明 + 右侧值；分组之间靠留白，不画分隔线 */
function InfoRow(props: {
  icon: LucideIcon;
  title: string;
  note?: string;
  value?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  const body = (
    <>
      <span
        className={`grid size-8 flex-none place-items-center rounded-[10px] ${props.danger ? "bg-danger-soft text-danger" : "bg-hover text-ink-2"}`}
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`text-tau-body block ${props.danger ? "text-danger" : "text-ink-1"}`}>
          {props.title}
        </span>
        {props.note && (
          <span className="text-tau-sm text-ink-3 block leading-snug">{props.note}</span>
        )}
      </span>
      {props.value && (
        <span className="text-tau-meta text-ink-3 max-w-[46%] truncate">{props.value}</span>
      )}
      {props.onClick && (
        <ChevronRight size={16} className="text-ink-3 flex-none" aria-hidden="true" />
      )}
    </>
  );
  const className = "flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left";
  return (
    <GroupCard>
      {props.onClick ? (
        <button
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          className={`${className} active:bg-hover disabled:opacity-45`}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </GroupCard>
  );
}

function StepNumber(props: { n: number }) {
  return (
    <span className="bg-accent-soft text-accent-text text-tau-sm mt-px grid size-6 flex-none place-items-center rounded-full leading-none font-semibold tabular-nums">
      {props.n}
    </span>
  );
}

const readClipboard = () =>
  window.navigator.clipboard?.readText().then(text => text?.trim() ?? "") ?? Promise.resolve("");

function PasteArea(props: { value: string; onChange: (value: string) => void; invalid?: boolean }) {
  return (
    <textarea
      value={props.value}
      rows={3}
      spellCheck={false}
      aria-label="配对信息"
      aria-invalid={props.invalid || undefined}
      placeholder="粘贴以 tau-pair: 开头的配对信息"
      onChange={event => props.onChange(event.target.value)}
      className="border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 focus:border-accent aria-[invalid=true]:border-danger font-tau-mono w-full resize-none rounded-xl border p-3 text-[13px] leading-relaxed outline-none"
    />
  );
}

/** 本地先判断格式与有效期，最终仍以原生配对校验为准 */
function localPairProblem(code: string) {
  const preview = previewDevicePairCode(code);
  if (!preview) return "DEVICE_SYNC_PAIR";
  return preview.expires < Date.now() ? "DEVICE_SYNC_PAIR_EXPIRED" : undefined;
}
function UnpairedView(props: {
  pairing: boolean;
  error: unknown;
  onPair: (code: string) => void;
  onEdit: () => void;
}) {
  const [code, setCode] = useState("");
  const [manual, setManual] = useState(false);

  const paste = async () => {
    props.onEdit();
    const text = await readClipboard().catch(() => "");
    if (text.startsWith(PAIR_PREFIX)) {
      setCode(text);
      setManual(false);
      return;
    }
    setManual(true);
    toast.info("剪贴板里没有配对信息，可以手动粘贴");
  };

  if (props.pairing)
    return (
      <StatusCard tone="accent" icon={LoaderCircle} spinning title="正在建立本机副本">
        从电脑下载资料库。请让 Tau 留在前台，切走后会在回来时继续。现有资料库保持原样。
      </StatusCard>
    );

  if (code || manual) {
    const problem = code.trim() ? (props.error ?? localPairProblem(code)) : undefined;
    const described = problem ? describeDeviceSyncError(problem) : undefined;
    const expired = described && String(problem).includes("PAIR_EXPIRED");
    return (
      <>
        {described ? (
          <StatusCard
            tone={expired ? "warn" : "danger"}
            icon={expired ? Clock : AlertTriangle}
            title={described.title}
          >
            {described.hint}
          </StatusCard>
        ) : code ? (
          <StatusCard tone="accent" icon={Clipboard} title="配对信息已就绪">
            <span className="font-tau-mono block truncate text-[12px]">{code}</span>
          </StatusCard>
        ) : null}
        {manual && (
          <div className={described || code ? "mt-3" : ""}>
            <PasteArea
              value={code}
              invalid={Boolean(described)}
              onChange={value => {
                setCode(value.trim());
                props.onEdit();
              }}
            />
          </div>
        )}
        {code && !described && (
          <>
            <div className="mt-3">
              <InfoRow icon={Smartphone} title="在电脑上显示为" value="我的手机" />
            </div>
            <GroupNote className="mt-[7px]">
              首次配对会新建一份本机副本，现有资料库保持原样；以前配过同一份资料库时，离线修改都保留。
            </GroupNote>
          </>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {code && !described ? (
            <ActionButton label="配对" emphasis onClick={() => props.onPair(code)} />
          ) : (
            <ActionButton label="粘贴配对信息" emphasis onClick={() => void paste()} />
          )}
          <button
            type="button"
            className="text-tau-body text-ink-2 h-10"
            onClick={() => {
              setCode("");
              setManual(false);
              props.onEdit();
            }}
          >
            {code && !described ? "重新粘贴" : "取消"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <StatusCard tone="accent" icon={Link2} title="连接你常用的电脑">
        电脑上的 Tau 负责协调。连上后手机可离线编辑，回到同一个局域网自动补齐。
      </StatusCard>
      <GroupLabel>怎么连接</GroupLabel>
      <GroupCard>
        <ol className="grid gap-4 px-4 py-[18px]">
          {[
            ["在电脑上打开同步设置", "设置 → 同步 → 设备同步。还没开启时，选「由本机协调」。"],
            ["点「添加设备」，复制配对信息", "经隔空投送、备忘录或自己的聊天工具发到这台手机。"],
            ["回到这里粘贴", "第一次会请求「本地网络」权限，选允许。"],
          ].map(([title, detail], index) => (
            <li key={title} className="flex gap-3">
              <StepNumber n={index + 1} />
              <div className="min-w-0">
                <p className="text-tau-body text-ink-1 font-semibold">{title}</p>
                <p className="text-tau-sm text-ink-2 mt-0.5 leading-relaxed">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </GroupCard>
      <GroupNote className="mt-[7px]">首次配对会新建一份本机副本，现有资料库保持原样。</GroupNote>
      <div className="mt-4 flex">
        <ActionButton label="粘贴配对信息" emphasis onClick={() => void paste()} />
      </div>
    </>
  );
}

export function DeviceSyncSection() {
  const status = useSyncExternalStore(subscribeDeviceSyncStatus, getDeviceSyncStatus);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<unknown>();
  const [overwrite, setOverwrite] = useState<"closed" | "confirm" | "running">("closed");
  const [overwriteError, setOverwriteError] = useState<unknown>();
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairCode, setRepairCode] = useState("");
  const [repairError, setRepairError] = useState<unknown>();
  const [repairing, setRepairing] = useState(false);

  // 运行时没有单独的「已配对」标志：idle 表示未登记；首次配对失败留下的 error 也仍是未配对
  const paired = !pairing && status.phase !== "idle" && !(status.phase === "error" && pairError);

  const pair = async (code: string) => {
    setPairing(true);
    setPairError(undefined);
    try {
      await pairDevice(code);
      toast.success("已配对，手机将自动补齐");
    } catch (error) {
      setPairError(error);
    } finally {
      setPairing(false);
    }
  };
  const repair = async () => {
    setRepairing(true);
    setRepairError(undefined);
    try {
      await pairDevice(repairCode);
      setRepairOpen(false);
      setRepairCode("");
      toast.success("已重新配对，离线修改会自动补齐");
    } catch (error) {
      setRepairError(error);
    } finally {
      setRepairing(false);
    }
  };
  const download = async () => {
    setOverwrite("running");
    setOverwriteError(undefined);
    try {
      await downloadDeviceLibrary();
      setOverwrite("closed");
      toast.success("已换成电脑上的版本");
    } catch (error) {
      setOverwriteError(error);
      setOverwrite("confirm");
    }
  };

  return (
    <section>
      <GroupLabel>局域网设备同步</GroupLabel>
      {paired ? (
        <ConnectedView
          phase={status.phase}
          error={status.error}
          lastSync={status.lastSync}
          pendingAssets={status.pendingAssets}
          preservedCopies={status.preservedCopies}
          onOverwrite={() => {
            setOverwriteError(undefined);
            setOverwrite("confirm");
          }}
          onRepair={() => setRepairOpen(true)}
        />
      ) : (
        <UnpairedView
          pairing={pairing}
          error={pairError}
          onPair={code => void pair(code)}
          onEdit={() => setPairError(undefined)}
        />
      )}
      <BottomSheet
        open={overwrite !== "closed"}
        dismissible={overwrite !== "running"}
        backDismiss={overwrite !== "running"}
        onClose={() => setOverwrite("closed")}
      >
        <h3 className="text-tau-title-lg text-ink-1 font-semibold">用电脑版本覆盖这台手机</h3>
        <p className="text-tau-meta text-ink-2 mt-1 leading-relaxed">
          「{deviceSyncDatabase() || "当前资料库"}」会以协调电脑为准重新下载。这台手机会丢弃：
        </p>
        <ul className="text-tau-meta text-ink-1 mt-3 grid gap-2">
          {OVERWRITE_LOSES.map(item => (
            <li key={item} className="flex items-start gap-2">
              <X
                size={15}
                strokeWidth={1.9}
                className="text-ink-3 mt-[3px] flex-none"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-tau-sm text-ink-2 mt-3">账号、配对信息和其他资料库不受影响。</p>
        {overwrite === "running" && (
          <p className="text-tau-sm text-ink-3 mt-2">
            正在下载，期间这份资料库暂停编辑。请让 Tau 留在前台。
          </p>
        )}
        {overwriteError !== undefined && (
          <p role="alert" className="text-tau-sm text-danger mt-2">
            下载没有完成：{describeDeviceSyncError(overwriteError).title}
            。手机上的资料保持原样，可以继续编辑。
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <ActionButton
            label={
              overwrite === "running"
                ? "下载中…"
                : overwriteError !== undefined
                  ? "重试"
                  : "下载并覆盖"
            }
            emphasis={false}
            danger
            busy={overwrite === "running"}
            disabled={overwrite === "running"}
            onClick={() => void download()}
          />
          <button
            type="button"
            disabled={overwrite === "running"}
            className="text-tau-body text-ink-2 h-10 disabled:opacity-45"
            onClick={() => setOverwrite("closed")}
          >
            取消
          </button>
        </div>
      </BottomSheet>
      <BottomSheet
        open={repairOpen}
        title="重新粘贴配对信息"
        dismissible={!repairing}
        backDismiss={!repairing}
        onClose={() => setRepairOpen(false)}
      >
        <p className="text-tau-meta text-ink-2 mb-3 leading-relaxed">
          电脑换了网络地址，或者这台手机的配对被解除时使用。连接的还是同一份资料库，手机上的修改都会保留。
        </p>
        <PasteArea
          value={repairCode}
          invalid={repairError !== undefined}
          onChange={value => {
            setRepairCode(value.trim());
            setRepairError(undefined);
          }}
        />
        {repairError !== undefined && (
          <p role="alert" className="text-tau-sm text-danger mt-2">
            {describeDeviceSyncError(repairError).title}。
            {describeDeviceSyncError(repairError).hint}
          </p>
        )}
        <div className="mt-4 flex">
          <ActionButton
            label={repairing ? "正在配对…" : "重新配对"}
            emphasis
            busy={repairing}
            disabled={repairing || !repairCode}
            onClick={() => void repair()}
          />
        </div>
      </BottomSheet>
    </section>
  );
}

function ConnectedView(props: {
  phase: "idle" | "syncing" | "synced" | "offline" | "error";
  error?: string;
  lastSync?: number;
  pendingAssets: number;
  preservedCopies: number;
  onOverwrite: () => void;
  onRepair: () => void;
}) {
  const since = props.lastSync ? formatRelativeTime(props.lastSync, Date.now()) : undefined;
  const problem = props.error ? describeDeviceSyncError(props.error) : undefined;
  const sync = <ActionButton label="立即补齐" emphasis={false} onClick={wakeDeviceSync} />;
  let card;
  if (props.phase === "syncing")
    card = (
      <StatusCard tone="accent" icon={LoaderCircle} spinning title="正在补齐…">
        合并电脑和手机的修改，正文都会保留。
      </StatusCard>
    );
  else if (props.phase === "offline")
    card = (
      <StatusCard tone="warn" icon={WifiOff} title="暂时连不上协调电脑" footer={sync}>
        本机照常阅读和编辑，修改已保存在这台手机上，连上后自动补齐。{since && `上次同步 ${since}。`}
        <span className="mt-2 block">
          检查手机和电脑是否在同一个 Wi‑Fi、电脑上的 Tau 是否开着。
        </span>
      </StatusCard>
    );
  else if (props.phase === "error")
    card = (
      <StatusCard
        tone="danger"
        icon={AlertTriangle}
        title="这次同步没有完成"
        footer={
          problem?.repair ? (
            <ActionButton label="重新粘贴配对信息" emphasis={false} onClick={props.onRepair} />
          ) : (
            sync
          )
        }
      >
        已保存的内容不受影响，可以继续编辑。
        {problem && (
          <span className="mt-2 block">
            <b className="text-ink-1 font-semibold">{problem.title}</b>　{problem.hint}
          </span>
        )}
      </StatusCard>
    );
  else
    card = (
      <StatusCard
        tone="ok"
        icon={CheckCircle2}
        title={props.pendingAssets ? "正文已同步，图片还在下载" : "已与协调电脑同步"}
        footer={sync}
      >
        {props.pendingAssets
          ? "图片稍后显示，不影响阅读和编辑。"
          : `${since ? `${since}补齐 · ` : ""}打开 Tau、回到前台或重新联网时自动补齐。`}
      </StatusCard>
    );
  return (
    <>
      {card}
      {props.pendingAssets > 0 && (
        <div className="mt-3">
          <InfoRow
            icon={ImageIcon}
            title={`${props.pendingAssets} 张图片待下载`}
            note="自动重试，未下载完的文件不会被当作完成"
          />
        </div>
      )}
      {props.preservedCopies > 0 && (
        <div className="mt-3">
          <InfoRow
            icon={Files}
            title={`已保留 ${props.preservedCopies} 份冲突副本`}
            note="可在协调电脑的同步设置里查看；日常同步不受影响"
          />
        </div>
      )}
      <GroupLabel>这台手机</GroupLabel>
      <InfoRow icon={Database} title="本机资料库" value={deviceSyncDatabase() || "—"} />
      <GroupLabel>恢复</GroupLabel>
      <InfoRow
        icon={Download}
        title="用电脑版本覆盖这台手机"
        note={props.phase === "offline" ? "连上协调电脑后才能使用" : "手机上的资料明显不对时才需要"}
        danger
        disabled={props.phase === "offline"}
        onClick={props.onOverwrite}
      />
      <GroupLabel>更多</GroupLabel>
      <InfoRow
        icon={Link2}
        title="重新粘贴配对信息"
        note="电脑换了网络地址时使用，修改都会保留"
        onClick={props.onRepair}
      />
      <GroupNote className="mt-[7px]">
        暂停同步、解除这台手机的配对，在协调电脑的设置里操作。
      </GroupNote>
    </>
  );
}
