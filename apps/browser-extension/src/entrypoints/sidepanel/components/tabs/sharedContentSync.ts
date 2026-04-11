export type RemoteSyncRequirement = "none" | "pull-remote" | "confirm-sync";

export interface ResolveRemoteSyncRequirementInput {
  remoteUpdateTime: number;
  lastSyncedContentUpdateTime: number | null;
  localContentUpdatedAt: number | null;
  contentMatchesRemote: boolean;
}

export function resolveRemoteSyncRequirement(
  input: ResolveRemoteSyncRequirementInput,
): RemoteSyncRequirement {
  const {
    remoteUpdateTime,
    lastSyncedContentUpdateTime,
    localContentUpdatedAt,
    contentMatchesRemote,
  } = input;

  if (contentMatchesRemote) {
    return "none";
  }

  if (lastSyncedContentUpdateTime == null) {
    return "confirm-sync";
  }

  if (remoteUpdateTime <= lastSyncedContentUpdateTime) {
    return "none";
  }

  if ((localContentUpdatedAt ?? 0) <= lastSyncedContentUpdateTime) {
    return "pull-remote";
  }

  return "confirm-sync";
}
