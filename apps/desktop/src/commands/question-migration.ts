import { invoke } from "@/electron";

/** 旧问题数据迁入问题插件（PS-046 3.2）的主进程命令 */
export interface QuestionMigrationResult {
  questions: number;
  answers: number;
  groups: number;
  links: number;
  events: number;
}

export const hasPendingQuestionMigration = (databaseName: string): Promise<boolean> =>
  invoke("question-migration:pending", { databaseName });

export const runQuestionMigration = (
  databaseName: string
): Promise<QuestionMigrationResult | null> => invoke("question-migration:run", { databaseName });
