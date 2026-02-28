import type { ContentSnapshot, RangeCandidate } from "./types";

const MAX_SNAPSHOT_SIZE = 100;
const snapshots = new Map<string, ContentSnapshot>();
const matchRanges = new Map<
  string,
  { snapshotId: string; start: number; end: number }
>();

const trimSnapshots = () => {
  if (snapshots.size <= MAX_SNAPSHOT_SIZE) return;
  const keys = [...snapshots.keys()];
  const removeCount = snapshots.size - MAX_SNAPSHOT_SIZE;
  keys.slice(0, removeCount).forEach((key) => {
    snapshots.delete(key);
  });
};

export const putSnapshot = (snapshot: ContentSnapshot) => {
  snapshots.set(snapshot.id, snapshot);
  trimSnapshots();
};

export const getSnapshot = (snapshotId: string) => {
  return snapshots.get(snapshotId) || null;
};

export const registerRangeCandidates = (candidates: RangeCandidate[]) => {
  candidates.forEach((candidate) => {
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
