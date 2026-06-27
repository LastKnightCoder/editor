import { invoke } from "@/electron";
import type {
  BadgeAward,
  BadgeDashboard,
  BadgeDefinition,
  BadgeProgress,
  CreateBadgeDefinitionInput,
  CreateBadgeManualEntryInput,
  UpdateBadgeDefinitionInput,
} from "@/types";

export const listBadgeDefinitions = (): Promise<BadgeDefinition[]> => {
  return invoke("badge:list-definitions");
};

export const createBadgeDefinition = (
  payload: CreateBadgeDefinitionInput,
): Promise<BadgeDefinition> => {
  return invoke("badge:create-definition", payload);
};

export const updateBadgeDefinition = (
  payload: UpdateBadgeDefinitionInput,
): Promise<BadgeDefinition> => {
  return invoke("badge:update-definition", payload);
};

export const archiveBadgeDefinition = (
  id: number,
): Promise<BadgeDefinition> => {
  return invoke("badge:archive-definition", id);
};

export const listBadgeAwards = (): Promise<BadgeAward[]> => {
  return invoke("badge:list-awards");
};

export const getBadgeDashboard = (): Promise<BadgeDashboard> => {
  return invoke("badge:get-dashboard");
};

export const createBadgeManualEntry = (
  payload: CreateBadgeManualEntryInput,
) => {
  return invoke("badge:create-manual-entry", payload);
};

export const evaluateBadgeDefinition = (
  definitionId: number,
): Promise<BadgeProgress | null> => {
  return invoke("badge:evaluate-definition", definitionId);
};

export const evaluateAllBadges = (): Promise<BadgeProgress[]> => {
  return invoke("badge:evaluate-all");
};
