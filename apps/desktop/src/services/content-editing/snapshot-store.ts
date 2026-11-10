import type { ContentSnapshot, RangeCandidate } from "./types";

const MAX_SNAPSHOT_SIZE = 100;
const MAX_EDIT_STATE_BYTES = 32 * 1024 * 1024;
const snapshots = new Map<string, ContentSnapshot>();
const matchRanges = new Map<string, { snapshotId: string; start: number; end: number }>();

const trimSnapshots = () => {
  let bytes = 0;
  for (const snapshot of snapshots.values()) bytes += snapshot.editState?.state.byteLength ?? 0;
  for (const [id, snapshot] of snapshots) {
    if (snapshots.size <= MAX_SNAPSHOT_SIZE && bytes <= MAX_EDIT_STATE_BYTES) break;
    bytes -= snapshot.editState?.state.byteLength ?? 0;
    snapshots.delete(id);
  }
  for (const [id, range] of matchRanges)
    if (!snapshots.has(range.snapshotId)) matchRanges.delete(id);
};

export const putSnapshot = (snapshot: ContentSnapshot) => {
  snapshots.set(snapshot.id, snapshot);
  trimSnapshots();
};

export const getSnapshot = (snapshotId: string) => {
  return snapshots.get(snapshotId) || null;
};

export const registerRangeCandidates = (candidates: RangeCandidate[]) => {
  candidates.forEach(candidate => {
    matchRanges.set(candidate.matchId, {
      snapshotId: candidate.snapshotId,
      start: candidate.start,
      end: candidate.end,
    });
  });
};

export const getRangeByMatchId = (matchId: string) => {
  return matchRanges.get(matchId) || null;
};
