import { useCallback, useEffect, useReducer, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import {
  LIMITS,
  type Listing,
  type Submission,
  type Upload,
  type UploadKind,
} from "../../../../contracts";
import { asPortalError, hasCode, isOutcomeUnknown, type PortalApiError } from "../../api/errors";
import { queryKeys, useApi } from "../../app/api";
import {
  editorReducer,
  initEditor,
  isDirty,
  sameValues,
  valuesOf,
  type DraftValues,
} from "./draftState";
import { localBackups } from "./localBackups";
import {
  formatErrors,
  mapServerFields,
  submitFieldErrors,
  type FieldErrors,
  type TextField,
} from "./validation";

/**
 * 草稿编辑：本地修改基于 base.revision；保存冲突、其他窗口的新版本都交给用户选择，
 * 不自动覆盖。未保存修改实时暂存到本机，刷新或重新登录后可恢复。
 */
export function useDraftEditor(server: Submission) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(editorReducer, server, initial =>
    initEditor(initial, localBackups.read(initial.id))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<PortalApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<PortalApiError | null>(null);
  const [serverFields, setServerFields] = useState<FieldErrors>({});
  const [showRequired, setShowRequired] = useState(false);
  const id = server.id;
  const dirty = isDirty(state);

  useEffect(() => dispatch({ type: "server", submission: server }), [server]);

  // 有未保存修改即暂存；旧版本暂存在用户决定前保留
  useEffect(() => {
    if (dirty) {
      localBackups.write({
        submissionId: id,
        baseRevision: state.base.revision,
        values: state.values,
        savedAt: new Date().toISOString(),
      });
    } else if (!state.staleBackup) {
      localBackups.remove(id);
    }
  }, [dirty, id, state.base.revision, state.values, state.staleBackup]);

  const publish = useCallback(
    (submission: Submission) => {
      queryClient.setQueryData(queryKeys.submission(submission.id), submission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions });
    },
    [queryClient]
  );

  const readLatest = async () => {
    try {
      const latest = await api.getSubmission(id);
      publish(latest);
      return latest;
    } catch {
      return null;
    }
  };

  const edit = (update: (values: DraftValues) => DraftValues) => dispatch({ type: "edit", update });

  const patchListing = (patch: Partial<Listing>) => {
    edit(values => ({ ...values, listing: { ...values.listing, ...patch } }));
    setServerFields(fields => {
      const next = { ...fields };
      for (const key of Object.keys(patch)) delete next[key as TextField];
      return next;
    });
  };

  const attachUpload = (kind: UploadKind, upload: Upload) => {
    if (kind === "package") edit(values => ({ ...values, packageUploadId: upload.id }));
    else if (kind === "icon")
      edit(values => ({ ...values, listing: { ...values.listing, iconUploadId: upload.id } }));
    else
      edit(values => {
        const ids = values.listing.screenshotUploadIds;
        if (ids.includes(upload.id) || ids.length >= LIMITS.screenshots) return values;
        return {
          ...values,
          listing: { ...values.listing, screenshotUploadIds: [...ids, upload.id] },
        };
      });
  };

  const fieldErrors: FieldErrors = {
    ...(showRequired ? submitFieldErrors(state.values.listing) : {}),
    ...formatErrors(state.values.listing),
    ...serverFields,
  };
  const hasFormatErrors = Object.keys(formatErrors(state.values.listing)).length > 0;
  const canSave = dirty && !saving && !submitting && !state.remote && !hasFormatErrors;

  async function save() {
    if (!canSave) return;
    const sent = state.values;
    const revision = state.base.revision;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.saveSubmission(id, { revision, ...sent });
      dispatch({ type: "saved", sent, result });
      publish(result);
      setServerFields({});
      toast.success("草稿已保存");
    } catch (error) {
      if (hasCode(error, "CONFLICT", "REVISION_CONFLICT", "SUBMISSION_LOCKED")) {
        // 其他窗口已保存：读取最新版本，交给冲突提示由用户选择
        const latest = await readLatest();
        if (latest) {
          dispatch({ type: "server", submission: latest });
          return;
        }
      }
      if (isOutcomeUnknown(error)) {
        const latest = await readLatest();
        if (latest && latest.revision > revision && sameValues(valuesOf(latest), sent)) {
          dispatch({ type: "saved", sent, result: latest });
          toast.success("草稿已保存");
          return;
        }
      }
      const failure = asPortalError(error);
      setServerFields(mapServerFields(failure.fields));
      setSaveError(failure);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.submitSubmission(id, state.base.revision);
      localBackups.remove(id);
      publish(result);
      toast.success("已提交，等待审核");
    } catch (error) {
      // 冲突或结果未知：读取核对，可能已在其他窗口或本次请求中提交成功
      if (
        hasCode(error, "CONFLICT", "REVISION_CONFLICT", "SUBMISSION_LOCKED") ||
        isOutcomeUnknown(error)
      ) {
        const latest = await readLatest();
        if (latest?.status === "pending_review") return;
      }
      const failure = asPortalError(error);
      setServerFields(mapServerFields(failure.fields));
      setSubmitError(failure);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    state,
    dispatch,
    dirty,
    saving,
    saveError,
    clearSaveError: () => setSaveError(null),
    submitting,
    submitError,
    clearSubmitError: () => setSubmitError(null),
    fieldErrors,
    revealRequired: () => setShowRequired(true),
    canSave,
    save,
    submit,
    edit,
    patchListing,
    attachUpload,
  };
}
