import type Database from "better-sqlite3";
import { cosine, meanVector, toFloats } from "../utils/embedding-vector";
import { resolveRelatedThreshold } from "./entity-context/related-threshold";
import {
  NOTE_TYPES_SQL,
  askedCandidates,
  bestSection,
  bridgeCandidates,
  loadNoteVectors,
  pairCandidates,
  type NotePair,
  type NoteVectors,
} from "./topic-insights-candidates";
import type {
  CandidatePair,
  CandidateResults,
  CandidateTask,
} from "./topic-insights-candidate-protocol";

const BELONG_CANDIDATES = 16;
const BRANCH_KNN_CHUNKS = 60;
const HOME_CANDIDATES = 3;

function sections(
  db: Database.Database,
  pairs: NotePair[],
  vectors: Map<string, NoteVectors>,
  longDocs: string[],
  check: () => void
): CandidatePair[] {
  const long = new Set(longDocs);
  return pairs.map(pair => {
    check();
    const result: CandidatePair = { ...pair, sections: [] };
    for (const [key, other] of [
      [pair.left, pair.right],
      [pair.right, pair.left],
    ]) {
      if (!long.has(key)) continue;
      const own = vectors.get(key);
      const target = vectors.get(other);
      const hit = own && target ? bestSection(db, own, target.mean) : null;
      if (hit) result.sections.push([key, hit]);
    }
    return result;
  });
}

function projectCandidates(
  db: Database.Database,
  task: Extract<CandidateTask, { kind: "project" }>,
  check: () => void
): CandidateResults["project"] {
  const normalize = (values: Float32Array[]) => {
    const mean = meanVector(values.map(value => Buffer.from(value.buffer)));
    return mean ? new Float32Array(toFloats(mean)) : null;
  };
  const keys = new Set(task.items.map(item => item.key));
  const vectors = loadNoteVectors(db, [...keys], check);
  const branches = new Map<number, Float32Array>();
  for (const root of new Set(task.items.map(item => item.root))) {
    check();
    const own = task.items
      .filter(item => item.root === root)
      .flatMap(item => {
        const vector = vectors.get(item.key);
        return vector ? [vector.mean] : [];
      });
    const mean = own.length ? normalize(own) : null;
    if (mean) branches.set(root, mean);
  }
  const candidates: CandidateResults["project"]["candidates"] = [];
  const homes: CandidateResults["project"]["homes"] = [];
  if (task.review === "growth" && task.threshold != null) {
    const outside = new Set(task.outside);
    const known = new Set(task.knownKeys);
    const links = new Map(task.links.map(([key, targets]) => [key, new Set(targets)]));
    const knn = db.prepare(`SELECT prefixed_id, distance FROM vec_documents
      WHERE vec_embedding MATCH ? AND k = ? AND type IN (${NOTE_TYPES_SQL})`);
    const best = new Map<string, { root: number; similarity: number }>();
    for (const [root, vector] of branches) {
      check();
      const rows = knn.all(Buffer.from(vector.buffer), BRANCH_KNN_CHUNKS) as Array<{
        prefixed_id: string;
        distance: number;
      }>;
      for (const hit of rows) {
        const similarity = 1 - hit.distance;
        if (similarity <= task.threshold) break;
        const key = hit.prefixed_id;
        if (!key.startsWith("card:") && !key.startsWith("article:")) continue;
        if (keys.has(key) || outside.has(key)) continue;
        if ([...keys].some(own => links.get(own)?.has(key))) continue;
        if ((best.get(key)?.similarity ?? -Infinity) >= similarity) continue;
        best.set(key, { root, similarity });
      }
    }
    for (const [key, hit] of [...best.entries()].sort(
      (a, b) => b[1].similarity - a[1].similarity
    )) {
      if (!known.has(key)) continue;
      candidates.push({ key, ...hit });
      if (candidates.length >= BELONG_CANDIDATES) break;
    }
  }
  if (task.review === "final" && branches.size) {
    const own = normalize([...branches.values()]);
    for (const other of task.others) {
      check();
      if (!own) continue;
      const values = loadNoteVectors(db, other.keys, check);
      const mean = values.size ? normalize([...values.values()].map(value => value.mean)) : null;
      if (!mean) continue;
      const similarity = cosine(own, mean);
      if (similarity > 0)
        homes.push({ projectId: other.projectId, title: other.title, similarity });
    }
    homes.sort((a, b) => b.similarity - a.similarity).splice(HOME_CANDIDATES);
  }
  return { candidates, homes };
}

export async function computeInsightCandidates(
  db: Database.Database,
  task: CandidateTask,
  check: () => void = () => undefined,
  stage: <T>(label: string, run: () => T | Promise<T>) => Promise<T> = async (_label, run) => run()
): Promise<CandidateResults[CandidateTask["kind"]]> {
  check();
  switch (task.kind) {
    case "threshold":
      return stage("threshold", () => resolveRelatedThreshold(db, task.now, check));
    case "project":
      return stage("project", () => projectCandidates(db, task, check));
    case "subtopic": {
      const links = new Map(task.links.map(([key, targets]) => [key, new Set(targets)]));
      const vectors = await stage("vectors", () => loadNoteVectors(db, task.keys, check));
      const pairs = await stage("pairs", () =>
        pairCandidates(
          [...vectors.values()],
          (a, b) => links.get(a)?.has(b) ?? false,
          task.threshold,
          task.limit,
          task.involving ? new Set(task.involving) : undefined,
          check
        )
      );
      return {
        pairs: await stage("sections", () => sections(db, pairs, vectors, task.longDocs, check)),
      };
    }
    case "global": {
      const links = new Map(task.links.map(([key, targets]) => [key, new Set(targets)]));
      const concepts = new Map(task.concepts);
      const pairs = await stage("bridges", () =>
        bridgeCandidates(
          db,
          task.topics,
          (a, b) => links.get(a)?.has(b) ?? false,
          key => links.get(key)?.size ?? 0,
          task.threshold,
          key => concepts.get(key) ?? [],
          check
        )
      );
      const asked = await stage("asked", () => askedCandidates(db, task.threshold, {}, check));
      const vectors = await stage("vectors", () =>
        loadNoteVectors(db, [...new Set(pairs.flatMap(pair => [pair.left, pair.right]))], check)
      );
      return {
        pairs: await stage("sections", () => sections(db, pairs, vectors, task.longDocs, check)),
        asked,
      };
    }
  }
}
