import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { X } from "lucide-react";
import { Button, ConfirmDialog, IconButton, toast } from "@tau/ui";
import { LIMITS, type Submission, type UploadKind } from "../../../../contracts";
import { sessionExpiry } from "../../app/session";
import { Notice } from "../../components/Notice";
import { PageHeader, StatusTag } from "../../components/PageHeader";
import { formatTime } from "../../components/format";
import { changedFields, valuesOf } from "./draftState";
import { ImagesSection } from "./ImagesSection";
import { IntroSection, SourceSection } from "./ListingFields";
import { PackageSection } from "./PackageSection";
import { SubmitPanel } from "./SubmitPanel";
import { useDraftEditor } from "./useDraftEditor";
import { useUploadRecord } from "./uploadQueries";
import { isTaskActive, useUploadTasks } from "./useUploadTasks";
import { precheckFile, submitChecklist } from "./validation";

const listOrNone = (items: string[]) => (items.length ? items.join("、") : "无内容差异");

export function DraftEditor({ server }: { server: Submission }) {
  const editor = useDraftEditor(server);
  const { state, dispatch, dirty } = editor;
  const { values, base } = state;
  const uploads = useUploadTasks(editor.attachUpload);
  const uploading = uploads.tasks.some(isTaskActive);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const packageRecord = useUploadRecord(values.packageUploadId);
  const packageReady =
    packageRecord.data?.status === "ready" ||
    (!packageRecord.data && values.packageUploadId === base.packageUploadId && !!base.manifest);
  const manifest =
    packageRecord.data?.manifest ??
    (values.packageUploadId === base.packageUploadId ? base.manifest : null);
  const checklist = submitChecklist({
    listing: values.listing,
    hasPackage: !!values.packageUploadId,
    packageReady,
    uploading,
    dirty,
  });

  const startUpload = (kind: UploadKind, file: File) => {
    const issue = precheckFile(kind, file);
    if (issue) toast.error(`${file.name}：${issue}`);
    else uploads.start(kind, file);
  };
  const startScreenshots = (files: File[]) => {
    const active = uploads.tasks.filter(
      task => task.kind === "screenshot" && isTaskActive(task)
    ).length;
    const allowed = Math.max(
      LIMITS.screenshots - values.listing.screenshotUploadIds.length - active,
      0
    );
    files.slice(0, allowed).forEach(file => startUpload("screenshot", file));
    if (files.length > allowed)
      toast.warning(`截图最多 ${LIMITS.screenshots} 张，已忽略 ${files.length - allowed} 个文件`);
  };

  // 离开保护：未保存修改已暂存，但进行中的上传会中断
  const guard = dirty || uploading;
  useEffect(() => {
    if (!guard) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guard]);
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guard && !sessionExpiry.get() && currentLocation.pathname !== nextLocation.pathname
  );

  const { save, canSave } = editor;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSave, save]);

  const requestSubmit = () => {
    if (checklist.every(item => item.ok)) setConfirmSubmit(true);
    else {
      editor.revealRequired();
      toast.warning("还有未完成的项目，请按检查清单补全");
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: "/submissions", label: "我的提交" }}
        title={manifest?.name ?? "新的插件提交"}
        tag={<StatusTag status="draft" />}
        meta={
          manifest
            ? `${manifest.id} · v${manifest.version} · 创建于 ${formatTime(base.createdAt)}`
            : `创建于 ${formatTime(base.createdAt)}`
        }
      />

      <div className="mb-5 flex flex-col gap-3 empty:hidden">
        {state.notice === "restored" && (
          <Notice
            tone="info"
            title="已恢复此浏览器暂存的未保存修改"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: "discard-local" })}
                >
                  放弃这些修改
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => dispatch({ type: "dismiss-notice" })}
                >
                  知道了
                </Button>
              </>
            }
          >
            检查后保存即可同步到服务端。
          </Notice>
        )}
        {state.staleBackup && (
          <Notice
            tone="warn"
            title="发现基于旧版本的未保存修改"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: "dismiss-stale-backup" })}
                >
                  丢弃
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => dispatch({ type: "load-stale-backup" })}
                >
                  载入暂存修改
                </Button>
              </>
            }
          >
            暂存于 {formatTime(state.staleBackup.savedAt)}
            ，此后草稿已在其他地方保存过。载入后再保存会覆盖服务器上的较新内容。 涉及：
            {listOrNone(changedFields(state.staleBackup.values, valuesOf(base)))}。
          </Notice>
        )}
        {state.remote && (
          <Notice
            tone="warn"
            title="此草稿已在其他窗口更新"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: "adopt-remote" })}
                >
                  使用新版本（放弃我的修改）
                </Button>
                <Button size="sm" variant="soft" onClick={() => dispatch({ type: "keep-mine" })}>
                  保留我的修改
                </Button>
              </>
            }
          >
            你的修改基于旧版本，服务器版本与你的内容不同之处：
            {listOrNone(changedFields(values, valuesOf(state.remote)))}。
            选择「保留我的修改」后再次保存将覆盖新版本。
          </Notice>
        )}
        {editor.saveError && (
          <Notice
            tone="danger"
            title="保存失败"
            actions={
              <IconButton aria-label="关闭" onClick={editor.clearSaveError}>
                <X size={14} />
              </IconButton>
            }
          >
            {editor.saveError.message}
          </Notice>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <PackageSection
            packageUploadId={values.packageUploadId}
            savedManifest={base.manifest}
            savedPackageUploadId={base.packageUploadId}
            uploads={uploads}
            onSelect={file => startUpload("package", file)}
          />
          <ImagesSection
            iconUploadId={values.listing.iconUploadId}
            screenshotUploadIds={values.listing.screenshotUploadIds}
            uploads={uploads}
            onIconSelect={file => startUpload("icon", file)}
            onIconRemove={() => editor.patchListing({ iconUploadId: null })}
            onScreenshotsSelect={startScreenshots}
            onScreenshotRemove={id =>
              editor.patchListing({
                screenshotUploadIds: values.listing.screenshotUploadIds.filter(item => item !== id),
              })
            }
          />
          <IntroSection
            listing={values.listing}
            errors={editor.fieldErrors}
            onPatch={editor.patchListing}
          />
          <SourceSection
            listing={values.listing}
            errors={editor.fieldErrors}
            onPatch={editor.patchListing}
          />
        </div>
        <aside className="lg:sticky lg:top-20">
          <SubmitPanel
            dirty={dirty}
            revision={base.revision}
            updatedAt={base.updatedAt}
            saving={editor.saving}
            canSave={editor.canSave}
            submitting={editor.submitting}
            checklist={checklist}
            submitError={editor.submitError}
            onSave={() => void editor.save()}
            onSubmit={requestSubmit}
            onDismissError={editor.clearSubmitError}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="提交审核"
        context={manifest ? `${manifest.name} v${manifest.version}` : undefined}
        description={
          <>
            服务端将验证你对 {values.listing.repository} 的管理权限，并确认 commit 存在。
            提交后进入待审核，内容冻结，本期不能修改或撤回。
          </>
        }
        confirmText="提交"
        onConfirm={() => editor.submit()}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={open => {
          // 确认离开后对话框也会回调关闭，此时不能再撤销导航
          if (!open && !leaving.current && blocker.state === "blocked") blocker.reset();
          leaving.current = false;
        }}
        title="离开此页？"
        description={
          uploading
            ? "进行中的上传会被取消。未保存的修改已暂存在此浏览器，回到这条草稿时可以恢复。"
            : "未保存的修改已暂存在此浏览器，回到这条草稿时可以恢复。"
        }
        confirmText="离开"
        cancelText="留下"
        onConfirm={() => {
          leaving.current = true;
          blocker.proceed?.();
        }}
      />
    </>
  );
}
