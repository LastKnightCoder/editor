import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmDialog, Textarea } from "@tau/ui";
import type { Release } from "../../../../contracts";
import { useApi } from "../../app/api";
import { errorMessage } from "../../api/errors";
import { useRefreshSubmission } from "./queries";

export function RevokeRelease({
  submissionId,
  release,
}: {
  submissionId: string;
  release: Release;
}) {
  const api = useApi();
  const refresh = useRefreshSubmission(submissionId);
  const [reason, setReason] = useState("");
  const [request, setRequest] = useState<{ reason: string; clientRequestId: string } | null>(null);
  const revoke = useMutation({
    mutationFn: (input: { reason: string; clientRequestId: string }) =>
      api.revokeRelease(submissionId, input),
    onSuccess: () => setRequest(null),
    onSettled: () => void refresh(),
  });
  if (release.revokedAt)
    return <p className="text-tau-sm text-danger">此版本已撤回，已停止公开分发。</p>;
  return (
    <div className="border-line-1 flex flex-col gap-2 border-t pt-3">
      <Textarea
        aria-label="版本撤回原因"
        placeholder="撤回原因（必填）"
        value={reason}
        maxLength={4000}
        onChange={event => setReason(event.target.value)}
      />
      <Button
        variant="danger-soft"
        disabled={!reason.trim()}
        onClick={() => {
          if (request?.reason !== reason.trim())
            setRequest({ reason: reason.trim(), clientRequestId: crypto.randomUUID() });
        }}
      >
        撤回此版本
      </Button>
      {revoke.isError && (
        <p role="alert" className="text-tau-sm text-danger">
          {errorMessage(revoke.error)}
        </p>
      )}
      <ConfirmDialog
        open={!!request}
        title={`撤回 v${release.version}`}
        danger
        confirmText="确认撤回"
        description="停止该版本的公开分发，联网客户端将停止其后台。此版本不能重新上架，其他版本不受影响。"
        onOpenChange={open => {
          if (!open) setRequest(null);
        }}
        onConfirm={async () => {
          if (request) await revoke.mutateAsync(request);
        }}
      />
    </div>
  );
}
