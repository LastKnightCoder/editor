/**
 * 白板画布顶部只显示需处理的保存与协作状态；共享入口（WhiteboardShareEntry）在右下状态栏。
 *
 * 未共享：「共享」打开说明对话框，确认后走主进程首次发布（暂停编辑 → 净化候选 → 服务端回执 →
 * 本机安装），结果未知时凭原操作续做或取消，不另建房间。已共享：成员与协作码沿用正文协作面板。
 * 远端换代时自动加载已确认的内容，尚未同步的修改尽力保留为本机白板。
 */

import { useWhiteboardChromeI18n, type WhiteboardChromeTranslator } from "../i18n-chrome";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, KeyRound, Layers, Link2, LogOut, Share2, Users, VideoOff } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, Popover, toast } from "@tau/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  cancelWhiteboardPublication,
  resumeWhiteboardPublication,
  unshareWhiteboard,
  resumeWhiteboardUnshare,
} from "@/commands/whiteboard-document";
import type { WhiteboardShareStatus } from "@/types/whiteboard-document";
import { AvatarStack, SharePanel, StatusDot } from "@/components/CollaborationUI";
import { othersSummary } from "@/components/CollaborationUI/model";
import { useCollaborationUiI18n } from "@/components/CollaborationUI/i18n";
import type { WhiteboardDocumentClient } from "@/services/whiteboard-documents/client";
import { whiteboardRemoteSync } from "@/services/whiteboard-documents/registry";
import { whiteboardShareStatusKey } from "@/services/whiteboard-documents/keys";
import { publishWhiteboardClient } from "@/services/whiteboard-documents/share";
import { remoteFailureText } from "@/features/collaboration/remoteErrors.i18n";
import type { WhiteboardRemoteState } from "@/services/whiteboard-documents/remote";
import { RecoverableBoundary } from "@/components/ErrorState";
import { UpgradeInlineAction } from "@/features/upgrade-prompt/UpgradeInlineNotice";
import { openPage } from "@/services/page-navigation";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { useWhiteboardShareStatus } from "../queries";
import {
  whiteboardSession,
  whiteboardSyncStatus,
  whiteboardStatusText,
  type WhiteboardPendingKind,
} from "../collaboration";

export function WhiteboardCollaborationBoundary({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey: string;
}) {
  return (
    <RecoverableBoundary
      resetKeys={[resetKey]}
      fallback={({ reset }) => <CollaborationFallback reset={reset} />}
    >
      {children}
    </RecoverableBoundary>
  );
}

function CollaborationFallback({ reset }: { reset: () => void }) {
  const { t } = useWhiteboardChromeI18n();
  return (
    <span role="alert" className="text-ink-2 text-tau-meta inline-flex items-center gap-2 p-2">
      {t("chrome.collab.unavailable")}
      <Button size="sm" variant="ghost" onClick={reset}>
        {t("chrome.retry")}
      </Button>
    </span>
  );
}

const idle = () => () => {};
const none = (): WhiteboardRemoteState | undefined => undefined;

/** 订阅共享状态读取及远端同步，未绑定时控制器报告本机状态。 */
function useWhiteboardRemote(client: WhiteboardDocumentClient) {
  const remoteSync = whiteboardRemoteSync(client);
  const remote = useSyncExternalStore(
    remoteSync ? remoteSync.subscribe : idle,
    remoteSync ? remoteSync.getSnapshot : none,
    remoteSync ? remoteSync.getSnapshot : none
  );
  return { remoteSync, remote };
}

export function WhiteboardCollaborationBar({
  client,
  documentId,
}: {
  client: WhiteboardDocumentClient;
  documentId: string;
}) {
  const { t } = useWhiteboardChromeI18n();
  const { remoteSync, remote } = useWhiteboardRemote(client);
  const share = useWhiteboardShareStatus(documentId);
  const pending = pendingKind(share.data);
  const [confirming, setConfirming] = useState<ConfirmKind>();
  const readNotice = () => {
    const local = client.getSnapshot();
    return pending || confirming || whiteboardSyncStatus(local, remote).actions?.length
      ? local
      : null;
  };
  const local = useSyncExternalStore(client.subscribe, readNotice, readNotice);
  if (!local) return null;
  const status = whiteboardSyncStatus(local, remote, pending);
  const databaseName = client.target.databaseName;
  const actions = status.actions ?? [];
  const binding = share.data?.binding ?? null;
  if (!pending && actions.length === 0 && !confirming) return null;

  return (
    <div
      className="text-tau-caption text-ink-2 flex min-h-8 items-center gap-2 px-3 py-1"
      role={status.tone === "error" ? "alert" : "status"}
    >
      <StatusDot tone={status.tone} />
      <span className="min-w-0 truncate">{whiteboardStatusText(status, t)}</span>
      {status.kind === "incompatible" && (
        <UpgradeInlineAction request={{ reason: "collaboration-incompatible" }} />
      )}
      {actions.includes("retry-save") && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void client.flush().catch(() => undefined)}
        >
          {t("chrome.collab.retrySave")}
        </Button>
      )}
      {actions.includes("retry") && remoteSync && (
        <Button size="sm" variant="ghost" onClick={() => remoteSync.retry()}>
          {t("chrome.collab.retrySync")}
        </Button>
      )}
      {actions.includes("detach") && remoteSync && (
        <Button size="sm" variant="ghost" onClick={() => setConfirming("detach")}>
          {t("chrome.collab.detach")}
        </Button>
      )}
      {pending && share.data && (
        <PendingRecovery databaseName={databaseName} documentId={documentId} status={share.data} />
      )}
      <span className="flex-1" />
      <ConfirmAction
        kind={confirming}
        onClose={() => setConfirming(undefined)}
        client={client}
        documentId={documentId}
        binding={binding}
      />
    </div>
  );
}

/** 右下状态栏的共享入口：未共享为「共享」，已共享为成员按钮（协作码、成员、结束共享）。 */
export function WhiteboardShareEntry({
  client,
  documentId,
}: {
  client: WhiteboardDocumentClient;
  documentId: string;
}) {
  const { remote } = useWhiteboardRemote(client);
  const share = useWhiteboardShareStatus(documentId);
  const [confirming, setConfirming] = useState<"close" | "leave">();
  if (!share.data || client.needsReopen || client.isDisposed) return null;
  const binding = share.data.binding ?? null;
  return (
    <>
      <WhiteboardShareControl
        client={client}
        binding={binding}
        pending={Boolean(pendingKind(share.data))}
        publication={share.data.publication}
        remote={remote}
        onUnshare={setConfirming}
      />
      <ConfirmAction
        kind={confirming}
        onClose={() => setConfirming(undefined)}
        client={client}
        documentId={documentId}
        binding={binding}
      />
    </>
  );
}

type ConfirmKind = "detach" | "close" | "leave";
function confirmCopy(
  t: WhiteboardChromeTranslator["t"]
): Record<
  ConfirmKind,
  { title: string; description: string; confirmText: string; impact?: string; danger?: boolean }
> {
  return {
    detach: {
      title: t("chrome.collab.detach"),
      description: t("chrome.collab.detachDescription"),
      confirmText: t("chrome.collab.detach"),
    },
    close: {
      title: t("chrome.collab.close"),
      description: t("chrome.collab.closeDescription"),
      impact: t("chrome.collab.closeImpact"),
      confirmText: t("chrome.collab.close"),
      danger: true,
    },
    leave: {
      title: t("chrome.collab.leave"),
      description: t("chrome.collab.leaveDescription"),
      confirmText: t("chrome.collab.leave"),
      danger: true,
    },
  };
}

/** 每种确认操作沿用一个操作身份：失败后重试不换身份，成功后才清空。 */
function ConfirmAction({
  kind,
  onClose,
  client,
  documentId,
}: {
  kind?: ConfirmKind;
  onClose: () => void;
  client: WhiteboardDocumentClient;
  documentId: string;
  binding: { serverUrl: string; documentId: string } | null;
}) {
  const { t } = useWhiteboardChromeI18n();
  const summary = useSyncExternalStore(client.subscribe, client.getSummary, client.getSummary);
  const queryClient = useQueryClient();
  const operations = useRef<Partial<Record<ConfirmKind, string>>>({});
  const [shown, setShown] = useState<ConfirmKind>("detach");
  if (kind && kind !== shown) setShown(kind);
  const copy = confirmCopy(t)[kind ?? shown];
  const run = async (action: ConfirmKind) => {
    const leaseId = client.leaseId;
    if (!leaseId) throw new Error("白板会话已关闭");
    const operationId = (operations.current[action] ??= crypto.randomUUID());
    const { missing } = await unshareWhiteboard(leaseId, { operationId, mode: action });
    toast.success(
      t(
        missing
          ? action === "close"
            ? "chrome.collab.closedMissing"
            : action === "leave"
              ? "chrome.collab.leftMissing"
              : "chrome.collab.detachedMissing"
          : action === "close"
            ? "chrome.collab.closed"
            : action === "leave"
              ? "chrome.collab.left"
              : "chrome.collab.detached",
        { count: missing }
      )
    );
    delete operations.current[action];
  };
  return (
    <ConfirmDialog
      open={Boolean(kind)}
      onOpenChange={open => !open && onClose()}
      title={copy.title}
      context={summary.title || t("chrome.untitled")}
      description={copy.description}
      impact={copy.impact}
      danger={copy.danger}
      confirmText={copy.confirmText}
      loadingText={t("chrome.collab.processing")}
      onConfirm={async () => {
        if (!kind) return;
        try {
          await run(kind);
        } catch (error) {
          toast.error(remoteFailureText(error));
          throw error;
        } finally {
          void queryClient.invalidateQueries({
            queryKey: whiteboardShareStatusKey(client.target.databaseName, documentId),
          });
        }
      }}
    />
  );
}

function pendingKind(status?: WhiteboardShareStatus): WhiteboardPendingKind | undefined {
  if (status?.unshare) return "unshare";
  if (status?.publication) return "publication";
}

/** 已固定、尚未完成的操作只能按原操作继续或取消。 */
function PendingRecovery({
  databaseName,
  documentId,
  status,
  onSettled,
}: {
  databaseName: string;
  documentId: string;
  status: WhiteboardShareStatus;
  onSettled?: () => void;
}) {
  if (status.unshare)
    return (
      <UnshareRecovery databaseName={databaseName} documentId={documentId} onSettled={onSettled} />
    );
  if (!status.publication) return null;
  return (
    <PublicationRecovery
      databaseName={databaseName}
      documentId={documentId}
      operationId={status.publication.operationId}
      onSettled={onSettled}
    />
  );
}

/**
 * 未完成的首次共享会让白板暂停打开；此时给出续做入口，不展示为读取失败。
 * 没有待处理操作时显示调用方的原错误。
 */
export function PendingTransition({
  databaseName,
  documentId,
  onSettled,
  children,
}: {
  databaseName: string;
  documentId: string;
  onSettled: () => void;
  children: ReactNode;
}) {
  const { t } = useWhiteboardChromeI18n();
  const share = useWhiteboardShareStatus(documentId);
  const kind = pendingKind(share.data);
  if (!kind || !share.data) return children;
  const description: Record<WhiteboardPendingKind, string> = {
    unshare: t("chrome.pending.unshare"),
    publication: t("chrome.pending.publication"),
  };
  return (
    <div role="status" className="text-ink-2 text-tau-body flex flex-col items-start gap-3 p-6">
      <p>{description[kind]}</p>
      <PendingRecovery
        databaseName={databaseName}
        documentId={documentId}
        status={share.data}
        onSettled={onSettled}
      />
    </div>
  );
}

function UnshareRecovery({
  databaseName,
  documentId,
  onSettled,
}: {
  databaseName: string;
  documentId: string;
  onSettled?: () => void;
}) {
  const { t } = useWhiteboardChromeI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const resume = async () => {
    setBusy(true);
    try {
      await resumeWhiteboardUnshare(databaseName, documentId);
      onSettled?.();
    } catch (error) {
      toast.error(remoteFailureText(error));
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({
        queryKey: whiteboardShareStatusKey(databaseName, documentId),
      });
    }
  };
  return (
    <Button size="sm" variant="soft" loading={busy} disabled={busy} onClick={() => void resume()}>
      {t("chrome.pending.resumeUnshare")}
    </Button>
  );
}

/** 首次共享结果未知或中途失败：只能按原操作继续或取消，白板在此期间保持暂停。 */
export function PublicationRecovery({
  databaseName,
  operationId,
  documentId,
  onSettled,
}: {
  databaseName: string;
  operationId: string;
  documentId: string;
  onSettled?: () => void;
}) {
  const { t } = useWhiteboardChromeI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"resume" | "cancel">();
  const run = async (kind: "resume" | "cancel") => {
    setBusy(kind);
    try {
      if (kind === "resume") {
        await resumeWhiteboardPublication(databaseName, operationId);
        toast.success(t("chrome.share.shared"));
      } else {
        await cancelWhiteboardPublication(databaseName, operationId);
        toast.success(t("chrome.pending.cancelled"));
      }
      onSettled?.();
    } catch (error) {
      toast.error(remoteFailureText(error));
    } finally {
      setBusy(undefined);
      void queryClient.invalidateQueries({
        queryKey: whiteboardShareStatusKey(databaseName, documentId),
      });
    }
  };
  return (
    <span className="flex flex-none items-center gap-1">
      <Button
        size="sm"
        variant="soft"
        loading={busy === "resume"}
        disabled={Boolean(busy)}
        onClick={() => void run("resume")}
      >
        {t("chrome.pending.resume")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "cancel"}
        disabled={Boolean(busy)}
        onClick={() => void run("cancel")}
      >
        {t("chrome.pending.cancel")}
      </Button>
    </span>
  );
}

function WhiteboardShareControl({
  client,
  binding,
  pending,
  publication,
  remote,
  onUnshare,
}: {
  client: WhiteboardDocumentClient;
  binding: { serverUrl: string; documentId: string } | null;
  /** 首次共享尚未完成：入口隐藏，已打开的对话框保留以显示失败原因。 */
  pending: boolean;
  publication?: WhiteboardShareStatus["publication"];
  remote?: WhiteboardRemoteState;
  onUnshare: (mode: "close" | "leave") => void;
}) {
  const collaborationContext = useCollaborationUiI18n();
  const { t } = useWhiteboardChromeI18n();
  const room = useCollaborationStore(state =>
    binding ? state.whiteboards?.find(item => item.id === binding.documentId) : undefined
  );
  const requests = useCollaborationStore(state => state.requests);
  const deviceId = useCollaborationStore(state => state.deviceId);
  const [open, setOpen] = useState(false);

  if (!binding)
    return (
      <>
        {!pending && (
          <Button
            variant="ghost"
            icon={Share2}
            className="aria-expanded:bg-press h-[30px] px-2.5"
            onClick={() => setOpen(true)}
          >
            {t("chrome.share.open")}
          </Button>
        )}
        <ShareDialog open={open} onOpenChange={setOpen} client={client} publication={publication} />
      </>
    );
  const session = room && whiteboardSession(room, remote);
  return (
    <Popover
      placement="top-end"
      arrow={false}
      className="w-[340px]"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={t("chrome.share.membersLabel")}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 aria-expanded:bg-press flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] pr-2.5 pl-1.5 transition-colors"
        >
          {session ? (
            <>
              <AvatarStack members={session.members} max={3} size={18} />
              <span className="whitespace-nowrap">
                {othersSummary(session, deviceId, collaborationContext)}
              </span>
            </>
          ) : (
            <>
              <Users className="size-3.5" strokeWidth={1.75} />
              <span className="whitespace-nowrap">{t("chrome.share.sharedLabel")}</span>
            </>
          )}
        </button>
      }
    >
      <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
        {session?.role === "owner" ? t("chrome.share.invites") : t("chrome.share.members")}
      </Popover.Header>
      <Popover.Body>
        {session ? (
          <SharePanel session={session} requests={requests} deviceId={deviceId} />
        ) : (
          <p className="text-ink-2 text-tau-meta">{t("chrome.share.membersLoading")}</p>
        )}
      </Popover.Body>
      <Popover.Footer>
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto"
          onClick={() => {
            try {
              openPage("collaboration");
              setOpen(false);
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : t("chrome.share.openPageFailed")
              );
            }
          }}
        >
          {t("chrome.share.view")}
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Button>
        {session && session.status === "active" && !pending && (
          <Button
            variant="danger-soft"
            size="sm"
            icon={LogOut}
            onClick={() => {
              setOpen(false);
              onUnshare(session.role === "owner" ? "close" : "leave");
            }}
          >
            {session.role === "owner" ? t("chrome.collab.close") : t("chrome.collab.leave")}
          </Button>
        )}
      </Popover.Footer>
    </Popover>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  client,
  publication,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: WhiteboardDocumentClient;
  publication?: WhiteboardShareStatus["publication"];
}) {
  const { t } = useWhiteboardChromeI18n();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown }>();
  const error = failure ? remoteFailureText(failure.cause) : undefined;
  const snapshot = useSyncExternalStore(client.subscribe, client.getSummary, client.getSummary);
  const identity = client.identity;
  const points = [
    { key: "code", icon: KeyRound, text: t("chrome.share.codeHint") },
    {
      key: "pages",
      icon: Layers,
      text: t("chrome.share.pagesHint", { count: snapshot.pageCount }),
    },
    { key: "references", icon: Link2, text: t("chrome.share.referencesHint") },
    { key: "video", icon: VideoOff, text: t("chrome.share.videoHint") },
  ];
  const share = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      await publishWhiteboardClient(client);
      toast.success(t("chrome.share.shared"));
      onOpenChange(false);
    } catch (failure) {
      setFailure({ cause: failure });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setFailure(undefined)}
      locked={busy}
      width={480}
      title={t("chrome.share.title")}
      context={snapshot.title || t("chrome.untitled")}
      footer={
        publication && identity ? (
          <PublicationRecovery
            databaseName={client.target.databaseName}
            documentId={identity.documentId}
            operationId={publication.operationId}
            onSettled={() => onOpenChange(false)}
          />
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t("chrome.share.cancel")}
            </Button>
            <Button
              variant="primary"
              icon={Share2}
              data-autofocus
              loading={busy}
              loadingText={t("chrome.share.loading")}
              onClick={() => void share()}
            >
              {t("chrome.share.start")}
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        {error && (
          <p
            role="alert"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm mb-3 px-3 py-2"
          >
            {error}
          </p>
        )}
        <div className="text-ink-2 text-tau-body">
          <p>{t("chrome.share.description")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {points.map(point => (
              <li key={point.key} className="flex items-start gap-2.5">
                <point.icon className="text-ink-3 mt-[3px] size-3.5 flex-none" strokeWidth={1.75} />
                <span className="text-tau-meta">{point.text}</span>
              </li>
            ))}
          </ul>
          {busy && (
            <p className="text-ink-3 text-tau-sm mt-3 flex items-center gap-1.5">
              <Users className="size-3.5" strokeWidth={1.75} />
              {t("chrome.share.progress")}
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
