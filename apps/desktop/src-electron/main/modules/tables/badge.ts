import Database from "better-sqlite3";
import type {
  BadgeAward,
  BadgeAwardPolicy,
  BadgeDashboard,
  BadgeDefinition,
  BadgeEvent,
  BadgeManualEntry,
  BadgeMilestone,
  BadgeProgress,
  BadgeRule,
  CreateBadgeMilestoneInput,
  CreateBadgeDefinitionInput,
  CreateBadgeEventInput,
  CreateBadgeManualEntryInput,
  UpdateBadgeDefinitionInput,
} from "@/types";
import ContentTable from "./content";
import {
  computeBadgePeriodRange,
  evaluateBadgeAward,
  evaluateBadgeRule,
} from "../../../../src/services/badge/ruleEngine";

export const BADGE_SYSTEM_DEFINITIONS: CreateBadgeDefinitionInput[] = [
  {
    systemKey: "output-daily-streak",
    name: "每日输出连续坚持",
    source: "system",
    successDesign: {
      title: "每日输出",
      description:
        "今天有任何输出（新增或更新卡片、文章、项目、知识库、白板、日记）。",
      icon: "✦",
      color: "#2563eb",
    },
    failureDesign: {
      title: "输出中断",
      description: "目标周期内没有任何输出。",
      icon: "!",
      color: "#991b1b",
    },
    rule: {
      type: "event_count",
      eventType: "output.created",
      comparator: ">=",
      target: 1,
    },
    schedule: { type: "daily" },
    awardPolicy: {
      type: "streak",
      target: 0,
      failureEnabled: false,
      graceDays: 1,
    },
    milestones: [7, 30, 180, 365, 1000, 2000].map((target, index) => ({
      milestoneKey: `output-daily-streak-${target}`,
      targetValue: target,
      title: target === 7 ? "每日输出" : `每日输出 ${target} 天`,
      description: `连续 ${target} 天每天都有输出。`,
      icon: String(target),
      color: "#2563eb",
      sortOrder: index,
    })),
    retroactiveMode: "system",
  },
  ...[50, 100, 500, 1000, 5000, 10000].map((target) => ({
    systemKey: `card-total-${target}`,
    name: `卡片总数 ${target}`,
    source: "system" as const,
    successDesign: {
      title: `卡片总数 ${target}`,
      description: `卡片累计达到 ${target} 张。`,
      icon: String(target),
      color: "#059669",
    },
    rule: {
      type: "aggregate_snapshot" as const,
      aggregateKey: "card.total",
      comparator: ">=" as const,
      target,
    },
    schedule: { type: "all_time" as const },
    awardPolicy: { type: "threshold" as const, target },
    retroactiveMode: "system" as const,
  })),
  ...[10, 50, 100, 500, 1000].map((target) => ({
    systemKey: `article-total-${target}`,
    name: `文章总数 ${target}`,
    source: "system" as const,
    successDesign: {
      title: `文章总数 ${target}`,
      description: `文章累计达到 ${target} 篇。`,
      icon: String(target),
      color: "#7c3aed",
    },
    rule: {
      type: "aggregate_snapshot" as const,
      aggregateKey: "article.total",
      comparator: ">=" as const,
      target,
    },
    schedule: { type: "all_time" as const },
    awardPolicy: { type: "threshold" as const, target },
    retroactiveMode: "system" as const,
  })),
];

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toDateKey(time: number) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function ruleMatchesEventType(rule: BadgeRule, eventType: string): boolean {
  if ("op" in rule) {
    return rule.conditions.some((condition) =>
      ruleMatchesEventType(condition, eventType),
    );
  }
  return rule.type === "event_count" && rule.eventType === eventType;
}

function ruleNeedsAggregates(rule: BadgeRule): boolean {
  if ("op" in rule) {
    return rule.conditions.some(ruleNeedsAggregates);
  }
  return rule.type === "aggregate_snapshot";
}

function collectRuleEventTypes(rule: BadgeRule): string[] {
  if ("op" in rule) {
    return Array.from(
      new Set(
        rule.conditions.flatMap((condition) =>
          collectRuleEventTypes(condition),
        ),
      ),
    );
  }
  return rule.type === "event_count" ? [rule.eventType] : [];
}

export default class BadgeTable {
  static upgradeTable(db: Database.Database) {
    this.ensureSystemDefinitions(db);
    this.evaluateAll(db);
  }

  static getListenEvents() {
    return {
      "badge:list-definitions": this.listDefinitions.bind(this),
      "badge:create-definition": this.createDefinition.bind(this),
      "badge:update-definition": this.updateDefinition.bind(this),
      "badge:archive-definition": this.archiveDefinition.bind(this),
      "badge:list-awards": this.listAwards.bind(this),
      "badge:get-dashboard": this.getDashboard.bind(this),
      "badge:create-manual-entry": this.createManualEntry.bind(this),
      "badge:evaluate-definition": this.evaluateDefinitionById.bind(this),
      "badge:evaluate-all": this.evaluateAll.bind(this),
    } as const;
  }

  static parseDefinition(row: any): BadgeDefinition {
    const milestones = Array.isArray(row.milestones)
      ? (row.milestones as BadgeMilestone[])
      : [];
    return {
      id: row.id,
      systemKey: row.system_key,
      name: row.name,
      source: row.source,
      status: row.status,
      successDesign: parseJson(row.success_design, { title: row.name }),
      failureDesign: parseJson(row.failure_design, null),
      rule: parseJson(row.rule_json, {
        type: "event_count",
        eventType: "",
        comparator: ">=",
        target: 1,
      } as BadgeRule),
      schedule: parseJson(row.schedule_json, { type: "all_time" }),
      awardPolicy: parseJson(row.award_policy_json, {
        type: "threshold",
        target: 1,
      }),
      milestones,
      retroactiveMode: row.retroactive_mode,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static parseMilestone(row: any): BadgeMilestone {
    return {
      id: row.id,
      definitionId: row.definition_id,
      milestoneKey: row.milestone_key,
      targetValue: row.target_value,
      title: row.title,
      description: row.description,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sort_order ?? 0,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static parseEvent(row: any): BadgeEvent {
    return {
      id: row.id,
      eventKey: row.event_key,
      eventType: row.event_type,
      eventTime: row.event_time,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      value: row.value ?? 1,
      metadata: parseJson(row.metadata, null),
      createTime: row.create_time,
    };
  }

  static parseManualEntry(row: any): BadgeManualEntry {
    return {
      id: row.id,
      definitionId: row.definition_id,
      manualKey: row.manual_key,
      entryDate: row.entry_date,
      completedAt: row.completed_at,
      detailContentId: row.detail_content_id,
      attachments: parseJson(row.attachments, []),
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static parseProgress(row: any): BadgeProgress {
    return {
      id: row.id,
      definitionId: row.definition_id,
      currentPeriodKey: row.current_period_key,
      currentValue: row.current_value ?? 0,
      currentStreak: row.current_streak ?? 0,
      bestStreak: row.best_streak ?? 0,
      accumulatedCount: row.accumulated_count ?? 0,
      lastPassedPeriodKey: row.last_passed_period_key,
      lastEvaluatedAt: row.last_evaluated_at,
      updateTime: row.update_time,
    };
  }

  static parseAward(row: any): BadgeAward {
    return {
      id: row.id,
      definitionId: row.definition_id,
      milestoneId: row.milestone_id,
      awardKind: row.award_kind,
      periodKey: row.period_key,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      targetValue: row.target_value,
      progressValue: row.progress_value,
      evidence: parseJson(row.evidence, null),
      awardedAt: row.awarded_at,
    };
  }

  static ensureSystemDefinitions(db: Database.Database) {
    for (const definition of BADGE_SYSTEM_DEFINITIONS) {
      if (!definition.systemKey) continue;
      const existing = db
        .prepare(
          `SELECT id FROM badge_definition
           WHERE system_key = ?
              OR (system_key IS NULL AND source = 'system' AND name = ?)
           LIMIT 1`,
        )
        .get(definition.systemKey, definition.name) as
        | { id: number }
        | undefined;
      if (existing) {
        this.updateDefinition(db, { ...definition, id: existing.id });
      } else {
        this.createDefinition(db, definition);
      }
    }
  }

  static listMilestones(
    db: Database.Database,
    definitionId: number,
  ): BadgeMilestone[] {
    return db
      .prepare(
        `SELECT * FROM badge_milestone
         WHERE definition_id = ?
         ORDER BY sort_order ASC, target_value ASC`,
      )
      .all(definitionId)
      .map((row) => this.parseMilestone(row));
  }

  private static getDefaultMilestoneInput(
    definition: BadgeDefinition | CreateBadgeDefinitionInput,
  ): CreateBadgeMilestoneInput | null {
    if (definition.awardPolicy.target <= 0) {
      return null;
    }
    return {
      milestoneKey: "default",
      targetValue: definition.awardPolicy.target,
      title: definition.successDesign.title || definition.name,
      description: definition.successDesign.description ?? null,
      icon: definition.successDesign.icon ?? null,
      color: definition.successDesign.color ?? null,
      sortOrder: 0,
    };
  }

  private static syncMilestones(
    db: Database.Database,
    definitionId: number,
    definition: BadgeDefinition | CreateBadgeDefinitionInput,
  ) {
    const now = Date.now();
    const milestones =
      definition.milestones && definition.milestones.length > 0
        ? definition.milestones
        : [this.getDefaultMilestoneInput(definition)].filter(
            (milestone): milestone is CreateBadgeMilestoneInput =>
              milestone !== null,
          );

    const keepIds: number[] = [];
    for (const [index, milestone] of milestones.entries()) {
      const targetValue = Math.max(1, Number(milestone.targetValue) || 1);
      const existing = db
        .prepare(
          `SELECT id FROM badge_milestone
           WHERE definition_id = ? AND target_value = ?
           LIMIT 1`,
        )
        .get(definitionId, targetValue) as { id: number } | undefined;
      const milestoneKey =
        milestone.milestoneKey ?? `target-${String(targetValue)}`;
      const title =
        milestone.title || `${definition.successDesign.title} ${targetValue}`;
      if (existing) {
        db.prepare(
          `
          UPDATE badge_milestone
          SET milestone_key = ?, target_value = ?, title = ?, description = ?, icon = ?, color = ?, sort_order = ?, update_time = ?
          WHERE id = ?
        `,
        ).run(
          milestoneKey,
          targetValue,
          title,
          milestone.description ?? null,
          milestone.icon ?? null,
          milestone.color ?? null,
          milestone.sortOrder ?? index,
          now,
          existing.id,
        );
        keepIds.push(existing.id);
      } else {
        const result = db
          .prepare(
            `
            INSERT INTO badge_milestone
            (definition_id, milestone_key, target_value, title, description, icon, color, sort_order, create_time, update_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            definitionId,
            milestoneKey,
            targetValue,
            title,
            milestone.description ?? null,
            milestone.icon ?? null,
            milestone.color ?? null,
            milestone.sortOrder ?? index,
            now,
            now,
          );
        keepIds.push(Number(result.lastInsertRowid));
      }
    }

    if (keepIds.length === 0) {
      db.prepare(
        `UPDATE badge_award
         SET milestone_id = NULL
         WHERE milestone_id IN (
           SELECT id FROM badge_milestone
           WHERE definition_id = ?
         )`,
      ).run(definitionId);
      db.prepare(`DELETE FROM badge_milestone WHERE definition_id = ?`).run(
        definitionId,
      );
    } else {
      const placeholders = keepIds.map(() => "?").join(",");
      db.prepare(
        `UPDATE badge_award
         SET milestone_id = NULL
         WHERE milestone_id IN (
           SELECT id FROM badge_milestone
           WHERE definition_id = ? AND id NOT IN (${placeholders})
         )`,
      ).run(definitionId, ...keepIds);
      db.prepare(
        `DELETE FROM badge_milestone
         WHERE definition_id = ? AND id NOT IN (${placeholders})`,
      ).run(definitionId, ...keepIds);
    }
  }

  static listDefinitions(db: Database.Database): BadgeDefinition[] {
    return db
      .prepare(`SELECT * FROM badge_definition ORDER BY create_time DESC`)
      .all()
      .map((row) => {
        const definition = this.parseDefinition(row);
        return {
          ...definition,
          milestones: this.listMilestones(db, definition.id),
        };
      });
  }

  static getDefinition(
    db: Database.Database,
    id: number,
  ): BadgeDefinition | null {
    const row = db
      .prepare(`SELECT * FROM badge_definition WHERE id = ?`)
      .get(id);
    if (!row) return null;
    const definition = this.parseDefinition(row);
    return {
      ...definition,
      milestones: this.listMilestones(db, definition.id),
    };
  }

  static createDefinition(
    db: Database.Database,
    input: CreateBadgeDefinitionInput,
  ): BadgeDefinition {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO badge_definition
      (system_key, name, source, status, success_design, failure_design, rule_json, schedule_json, award_policy_json, retroactive_mode, create_time, update_time)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.systemKey ?? null,
      input.name,
      input.source ?? "custom",
      stringifyJson(input.successDesign),
      input.failureDesign ? stringifyJson(input.failureDesign) : null,
      stringifyJson(input.rule),
      stringifyJson(input.schedule),
      stringifyJson(input.awardPolicy),
      input.retroactiveMode ??
        (input.source === "system" ? "system" : "disabled"),
      now,
      now,
    );
    const created = this.getDefinition(db, Number(result.lastInsertRowid))!;
    this.syncMilestones(db, created.id, input);
    const withMilestones = this.getDefinition(db, created.id)!;
    this.evaluateDefinition(db, withMilestones);
    return withMilestones;
  }

  static updateDefinition(
    db: Database.Database,
    input: UpdateBadgeDefinitionInput,
  ): BadgeDefinition {
    const current = this.getDefinition(db, input.id);
    if (!current) throw new Error("badge definition not found");
    const now = Date.now();
    db.prepare(
      `
      UPDATE badge_definition
      SET system_key = ?, name = ?, source = ?, status = ?, success_design = ?, failure_design = ?, rule_json = ?, schedule_json = ?, award_policy_json = ?, retroactive_mode = ?, update_time = ?
      WHERE id = ?
    `,
    ).run(
      input.systemKey === undefined ? current.systemKey : input.systemKey,
      input.name ?? current.name,
      input.source ?? current.source,
      input.status ?? current.status,
      stringifyJson(input.successDesign ?? current.successDesign),
      input.failureDesign === undefined
        ? stringifyJson(current.failureDesign)
        : input.failureDesign
          ? stringifyJson(input.failureDesign)
          : null,
      stringifyJson(input.rule ?? current.rule),
      stringifyJson(input.schedule ?? current.schedule),
      stringifyJson(input.awardPolicy ?? current.awardPolicy),
      input.retroactiveMode ?? current.retroactiveMode,
      now,
      input.id,
    );
    const updated = this.getDefinition(db, input.id)!;
    this.syncMilestones(db, input.id, {
      ...updated,
      milestones: input.milestones ?? updated.milestones,
    });
    const withMilestones = this.getDefinition(db, input.id)!;
    this.evaluateDefinition(db, withMilestones);
    return withMilestones;
  }

  static archiveDefinition(db: Database.Database, id: number): BadgeDefinition {
    return this.updateDefinition(db, { id, status: "archived" });
  }

  static listAwards(db: Database.Database): BadgeAward[] {
    return db
      .prepare(`SELECT * FROM badge_award ORDER BY awarded_at DESC`)
      .all()
      .map((row) => this.parseAward(row));
  }

  static listProgress(db: Database.Database): BadgeProgress[] {
    return db
      .prepare(`SELECT * FROM badge_progress ORDER BY update_time DESC`)
      .all()
      .map((row) => this.parseProgress(row));
  }

  static listManualEntries(
    db: Database.Database,
    start?: number,
    end?: number,
  ) {
    let sql = `SELECT * FROM badge_manual_entry`;
    const args: number[] = [];
    if (start !== undefined && end !== undefined) {
      sql += ` WHERE completed_at >= ? AND completed_at < ?`;
      args.push(start, end);
    }
    sql += ` ORDER BY completed_at DESC`;
    return db
      .prepare(sql)
      .all(...args)
      .map((row) => this.parseManualEntry(row));
  }

  static getDashboard(db: Database.Database): BadgeDashboard {
    const today = computeBadgePeriodRange({ type: "daily" });
    return {
      definitions: this.listDefinitions(db),
      progress: this.listProgress(db),
      awards: this.listAwards(db),
      todayManualEntries: this.listManualEntries(db, today.start, today.end),
    };
  }

  static recordEvent(db: Database.Database, input: CreateBadgeEventInput) {
    const now = Date.now();
    db.prepare(
      `
      INSERT OR IGNORE INTO badge_event
      (event_key, event_type, event_time, subject_type, subject_id, value, metadata, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      input.eventKey,
      input.eventType,
      input.eventTime,
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.value ?? 1,
      input.metadata ? stringifyJson(input.metadata) : null,
      now,
    );
    this.evaluateForEventType(db, input.eventType);
  }

  static createManualEntry(
    db: Database.Database,
    input: CreateBadgeManualEntryInput,
  ): BadgeManualEntry {
    const now = Date.now();
    const detailContentId = input.detailContent
      ? ContentTable.createContent(db, {
          content: input.detailContent as any,
        })
      : null;
    const stmt = db.prepare(`
      INSERT INTO badge_manual_entry
      (definition_id, manual_key, entry_date, completed_at, detail_content_id, attachments, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.definitionId,
      input.manualKey,
      input.entryDate,
      now,
      detailContentId,
      stringifyJson(input.attachments ?? []),
      now,
      now,
    );
    const entry = this.parseManualEntry(
      db
        .prepare(`SELECT * FROM badge_manual_entry WHERE id = ?`)
        .get(Number(result.lastInsertRowid)),
    );
    this.evaluateDefinitionById(db, input.definitionId);
    return entry;
  }

  static evaluateDefinitionById(
    db: Database.Database,
    definitionId: number,
  ): BadgeProgress | null {
    const definition = this.getDefinition(db, definitionId);
    return definition ? this.evaluateDefinition(db, definition) : null;
  }

  static evaluateAll(db: Database.Database): BadgeProgress[] {
    return this.evaluateDefinitions(
      db,
      this.listDefinitions(db).filter(
        (definition) => definition.status === "active",
      ),
    );
  }

  static evaluateForEventType(
    db: Database.Database,
    eventType: string,
  ): BadgeProgress[] {
    const definitions = this.listDefinitions(db).filter((definition) => {
      return (
        definition.status === "active" &&
        (ruleMatchesEventType(definition.rule, eventType) ||
          ruleNeedsAggregates(definition.rule))
      );
    });
    return this.evaluateDefinitions(db, definitions);
  }

  private static getProgress(
    db: Database.Database,
    definitionId: number,
  ): BadgeProgress {
    const row = db
      .prepare(`SELECT * FROM badge_progress WHERE definition_id = ?`)
      .get(definitionId);
    if (row) return this.parseProgress(row);
    const now = Date.now();
    db.prepare(
      `INSERT INTO badge_progress (definition_id, update_time) VALUES (?, ?)`,
    ).run(definitionId, now);
    return this.parseProgress(
      db
        .prepare(`SELECT * FROM badge_progress WHERE definition_id = ?`)
        .get(definitionId),
    );
  }

  private static buildAggregates(db: Database.Database) {
    const allCards = db
      .prepare(`SELECT COUNT(1) as count FROM cards`)
      .get() as { count: number };
    const articles = db
      .prepare(`SELECT COUNT(1) as count FROM articles WHERE is_delete = 0`)
      .get() as { count: number };
    const projectItems = db
      .prepare(`SELECT COUNT(1) as count FROM project_item`)
      .get() as { count: number };
    const documentItems = db
      .prepare(`SELECT COUNT(1) as count FROM document_items`)
      .get() as { count: number };
    const diaryEntries = db
      .prepare(`SELECT COUNT(1) as count FROM diary_entries`)
      .get() as { count: number };
    const whiteboards = db
      .prepare(`SELECT COUNT(1) as count FROM white_boards`)
      .get() as { count: number };

    return {
      "card.total": allCards.count,
      "article.total": articles.count,
      "project-item.total": projectItems.count,
      "document-item.total": documentItems.count,
      "diary.total": diaryEntries.count,
      "whiteboard.total": whiteboards.count,
    };
  }

  private static getRuleContext(
    db: Database.Database,
    range: ReturnType<typeof computeBadgePeriodRange>,
    aggregates: Record<string, number>,
    eventTypes: string[],
  ) {
    const events =
      eventTypes.length > 0
        ? db
            .prepare(
              `SELECT * FROM badge_event
               WHERE event_time >= ? AND event_time < ?
                 AND event_type IN (${eventTypes.map(() => "?").join(",")})`,
            )
            .all(range.start, range.end, ...eventTypes)
            .map((row) => this.parseEvent(row))
        : [];
    const manualEntries = this.listManualEntries(db, range.start, range.end);
    return {
      range,
      events,
      manualEntries,
      aggregates,
    };
  }

  private static upsertProgress(
    db: Database.Database,
    definitionId: number,
    progress: ReturnType<typeof evaluateBadgeAward>["nextProgress"],
  ) {
    const now = Date.now();
    db.prepare(
      `
      UPDATE badge_progress
      SET current_period_key = ?, current_value = ?, current_streak = ?, best_streak = ?, accumulated_count = ?, last_passed_period_key = ?, last_evaluated_at = ?, update_time = ?
      WHERE definition_id = ?
    `,
    ).run(
      progress.currentPeriodKey,
      progress.currentValue,
      progress.currentStreak,
      progress.bestStreak,
      progress.accumulatedCount,
      progress.lastPassedPeriodKey,
      progress.lastEvaluatedAt,
      now,
      definitionId,
    );
  }

  private static insertAward(
    db: Database.Database,
    definitionId: number,
    award:
      | ReturnType<typeof evaluateBadgeAward>["successAward"]
      | ReturnType<typeof evaluateBadgeAward>["successAwards"][number],
    evidence: Record<string, unknown>,
  ) {
    if (!award) return;
    // 成功徽章：同 definition + 同 target 只颁发一次，避免连续徽章中断后重新达成重复颁奖
    if (award.awardKind === "success") {
      const existed = db
        .prepare(
          `SELECT 1 FROM badge_award
           WHERE definition_id = ? AND award_kind = 'success' AND target_value = ?
           LIMIT 1`,
        )
        .get(definitionId, award.targetValue);
      if (existed) return;
    }
    const now = Date.now();
    db.prepare(
      `
      INSERT OR IGNORE INTO badge_award
      (definition_id, milestone_id, award_kind, period_key, period_start, period_end, target_value, progress_value, evidence, awarded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      definitionId,
      award.milestoneId ?? null,
      award.awardKind,
      award.periodKey,
      award.periodStart,
      award.periodEnd,
      award.targetValue,
      award.progressValue,
      stringifyJson(evidence),
      now,
    );
  }

  private static evaluateDefinition(
    db: Database.Database,
    definition: BadgeDefinition,
    aggregates = this.buildAggregates(db),
  ): BadgeProgress {
    const period = computeBadgePeriodRange(definition.schedule);
    const context = this.getRuleContext(
      db,
      period,
      aggregates,
      collectRuleEventTypes(definition.rule),
    );
    const ruleResult = evaluateBadgeRule(definition.rule, context);
    const previous = this.getProgress(db, definition.id);
    const awardResult = evaluateBadgeAward({
      schedule: definition.schedule,
      policy: definition.awardPolicy as BadgeAwardPolicy,
      milestones: definition.milestones,
      currentPeriodPassed: ruleResult.passed,
      currentValue: ruleResult.value,
      previousProgress: previous,
      period,
      now: Date.now(),
    });

    this.upsertProgress(db, definition.id, awardResult.nextProgress);
    for (const successAward of awardResult.successAwards) {
      this.insertAward(db, definition.id, successAward, {
        rule: ruleResult.evidence,
      });
    }
    this.insertAward(db, definition.id, awardResult.failureAward, {
      rule: ruleResult.evidence,
    });

    return this.getProgress(db, definition.id);
  }

  private static evaluateDefinitions(
    db: Database.Database,
    definitions: BadgeDefinition[],
  ): BadgeProgress[] {
    if (definitions.length === 0) return [];
    const aggregates = this.buildAggregates(db);
    return definitions.map((definition) =>
      this.evaluateDefinition(db, definition, aggregates),
    );
  }

  static recordContentEvent(
    db: Database.Database,
    eventType: string,
    subjectType: string,
    subjectId: number | bigint,
    eventTime = Date.now(),
    metadata?: Record<string, unknown>,
  ) {
    this.recordEvent(db, {
      eventKey: `${eventType}:${subjectType}:${subjectId}:${toDateKey(eventTime)}`,
      eventType,
      eventTime,
      subjectType,
      subjectId: Number(subjectId),
      value: 1,
      metadata,
    });
  }
}
