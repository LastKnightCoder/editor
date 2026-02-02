import { invoke } from "@/electron";
import type {
  VLQuizSet,
  CreateVLQuizSetInput,
  UpdateVLQuizSetInput,
  VLQuizItem,
  CreateVLQuizItemInput,
  UpdateVLQuizItemInput,
  VLQuizRecord,
  CreateVLQuizRecordInput,
} from "@/types";

export function listVLQuizSets(projectId: number): Promise<VLQuizSet[]> {
  return invoke("vl-quiz:list-sets", projectId);
}

export function getVLQuizSet(id: number): Promise<VLQuizSet | null> {
  return invoke("vl-quiz:get-set", id);
}

export function createVLQuizSet(
  payload: CreateVLQuizSetInput,
): Promise<VLQuizSet> {
  return invoke("vl-quiz:create-set", payload);
}

export function updateVLQuizSet(
  payload: UpdateVLQuizSetInput,
): Promise<VLQuizSet | null> {
  return invoke("vl-quiz:update-set", payload);
}

export function deleteVLQuizSet(id: number): Promise<boolean> {
  return invoke("vl-quiz:delete-set", id);
}

// ========== Quiz Item ==========

export function listVLQuizItems(quizSetId: number): Promise<VLQuizItem[]> {
  return invoke("vl-quiz:list-items", quizSetId);
}

export function getVLQuizItem(id: number): Promise<VLQuizItem | null> {
  return invoke("vl-quiz:get-item", id);
}

export function createVLQuizItem(
  payload: CreateVLQuizItemInput,
): Promise<VLQuizItem> {
  return invoke("vl-quiz:create-item", payload);
}

export function createVLQuizItemsBatch(
  items: CreateVLQuizItemInput[],
): Promise<VLQuizItem[]> {
  return invoke("vl-quiz:create-items-batch", items);
}

export function updateVLQuizItem(
  payload: UpdateVLQuizItemInput,
): Promise<VLQuizItem | null> {
  return invoke("vl-quiz:update-item", payload);
}

export function deleteVLQuizItem(id: number): Promise<boolean> {
  return invoke("vl-quiz:delete-item", id);
}

// ========== Quiz Record ==========

export function listVLQuizRecords(params: {
  quizSetId?: number;
  projectId?: number;
}): Promise<VLQuizRecord[]> {
  return invoke("vl-quiz:list-records", params);
}

export function getVLQuizRecord(id: number): Promise<VLQuizRecord | null> {
  return invoke("vl-quiz:get-record", id);
}

export function createVLQuizRecord(
  payload: CreateVLQuizRecordInput,
): Promise<VLQuizRecord> {
  return invoke("vl-quiz:create-record", payload);
}

export function deleteVLQuizRecord(id: number): Promise<boolean> {
  return invoke("vl-quiz:delete-record", id);
}
