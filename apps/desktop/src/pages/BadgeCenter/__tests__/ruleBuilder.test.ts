import { describe, expect, it } from "vitest";
import {
  buildBadgeRule,
  definitionToDraft,
  extractManualKeys,
  formatBadgeRuleText,
  getBadgeProgressValueLabel,
  normalizeMilestoneDrafts,
  validateMilestoneTargets,
  type BadgeRuleDraft,
} from "../ruleBuilder";

describe("BadgeCenter rule builder", () => {
  it("builds a two-level condition tree from grouped user choices", () => {
    const draft: BadgeRuleDraft = {
      topOp: "all",
      groups: [
        {
          id: "group-1",
          op: "all",
          conditions: [
            {
              id: "condition-1",
              source: "manual:custom",
              customManualKey: "no_dinner",
              comparator: ">=",
              target: 5,
            },
            {
              id: "condition-2",
              source: "manual:custom",
              customManualKey: "exercise",
              comparator: ">=",
              target: 7,
            },
          ],
        },
        {
          id: "group-2",
          op: "any",
          conditions: [
            {
              id: "condition-3",
              source: "event:card.permanent.created",
              comparator: ">=",
              target: 1,
            },
          ],
        },
      ],
    };

    expect(buildBadgeRule(draft)).toEqual({
      op: "all",
      conditions: [
        {
          op: "all",
          conditions: [
            {
              type: "manual_count",
              manualKey: "no_dinner",
              comparator: ">=",
              target: 5,
            },
            {
              type: "manual_count",
              manualKey: "exercise",
              comparator: ">=",
              target: 7,
            },
          ],
        },
        {
          type: "event_count",
          eventType: "card.permanent.created",
          comparator: ">=",
          target: 1,
        },
      ],
    });
  });

  it("extracts manual check-in keys from nested rules", () => {
    expect(
      extractManualKeys({
        op: "all",
        conditions: [
          {
            type: "event_count",
            eventType: "card.permanent.created",
            comparator: ">=",
            target: 1,
          },
          {
            op: "any",
            conditions: [
              {
                type: "manual_count",
                manualKey: "exercise",
                comparator: ">=",
                target: 1,
              },
              {
                type: "manual_count",
                manualKey: "no_dinner",
                comparator: ">=",
                target: 1,
              },
            ],
          },
        ],
      }),
    ).toEqual(["exercise", "no_dinner"]);
  });

  it("formats aggregate snapshot rules with user-facing names", () => {
    expect(
      formatBadgeRuleText({
        type: "aggregate_snapshot",
        aggregateKey: "card.total",
        comparator: ">=",
        target: 100,
      }),
    ).toBe("卡片总数 至少 100");
  });

  it("uses aggregate names as progress value labels", () => {
    expect(
      getBadgeProgressValueLabel({
        type: "aggregate_snapshot",
        aggregateKey: "card.total",
        comparator: ">=",
        target: 100,
      }),
    ).toBe("卡片总数");
    expect(
      getBadgeProgressValueLabel({
        type: "aggregate_snapshot",
        aggregateKey: "article.total",
        comparator: ">=",
        target: 100,
      }),
    ).toBe("文章总数");
  });

  it("normalizes milestone drafts into sorted unique positive targets", () => {
    expect(
      normalizeMilestoneDrafts([
        { id: "m-1", targetValue: 30, title: "30 天" },
        { id: "m-2", targetValue: 0, title: "无效" },
        { id: "m-3", targetValue: 7.8, title: "" },
        { id: "m-4", targetValue: 30, title: "重复" },
      ]),
    ).toEqual([
      {
        id: "m-3",
        targetValue: 7,
        title: "7",
      },
      {
        id: "m-1",
        targetValue: 30,
        title: "30 天",
      },
    ]);
  });

  it("allows empty milestone drafts", () => {
    expect(normalizeMilestoneDrafts([])).toEqual([]);
  });

  it("validates milestones as optional targets below the final target", () => {
    expect(validateMilestoneTargets([], 30)).toBeNull();
    expect(
      validateMilestoneTargets(
        [{ id: "m-1", targetValue: 7, title: "7 天" }],
        30,
      ),
    ).toBeNull();
    expect(
      validateMilestoneTargets(
        [{ id: "m-1", targetValue: 30, title: "30 天" }],
        30,
      ),
    ).toBe("阶段目标必须小于总目标");
  });

  it("allows milestones for open-ended long-term targets", () => {
    expect(
      validateMilestoneTargets(
        [
          { id: "m-1", targetValue: 7, title: "7 天" },
          { id: "m-2", targetValue: 365, title: "365 天" },
        ],
        0,
      ),
    ).toBeNull();
  });

  it("does not create a milestone draft when definitions have no milestones", () => {
    const draft = definitionToDraft({
      id: 1,
      name: "每日输出连续坚持",
      source: "custom",
      status: "active",
      successDesign: {
        title: "每日输出连续坚持",
        description: "持续输出",
        icon: "★",
        color: "#2563eb",
      },
      failureDesign: null,
      rule: {
        type: "event_count",
        eventType: "output.created",
        comparator: ">=",
        target: 1,
      },
      schedule: { type: "daily" },
      awardPolicy: { type: "streak", target: 30 },
      milestones: [],
      retroactiveMode: "disabled",
      createTime: 1,
      updateTime: 1,
    });

    expect(draft.milestones).toEqual([]);
  });

  it("keeps existing milestone titles when converting definitions to drafts", () => {
    const draft = definitionToDraft({
      id: 1,
      name: "每日输出连续坚持",
      source: "custom",
      status: "active",
      successDesign: {
        title: "每日输出连续坚持",
        description: "持续输出",
        icon: "★",
        color: "#2563eb",
      },
      failureDesign: null,
      rule: {
        type: "event_count",
        eventType: "output.created",
        comparator: ">=",
        target: 1,
      },
      schedule: { type: "daily" },
      awardPolicy: { type: "streak", target: 30 },
      milestones: [
        {
          id: 2,
          definitionId: 1,
          milestoneKey: "target-30",
          targetValue: 30,
          title: "坚持 30 天",
          description: null,
          icon: "30",
          color: "#2563eb",
          sortOrder: 1,
          createTime: 1,
          updateTime: 1,
        },
        {
          id: 1,
          definitionId: 1,
          milestoneKey: "target-7",
          targetValue: 7,
          title: "坚持 7 天",
          description: null,
          icon: "7",
          color: "#2563eb",
          sortOrder: 0,
          createTime: 1,
          updateTime: 1,
        },
      ],
      retroactiveMode: "disabled",
      createTime: 1,
      updateTime: 1,
    });

    expect(draft.milestones).toEqual([
      {
        id: "milestone-1",
        targetValue: 7,
        title: "坚持 7 天",
      },
      {
        id: "milestone-2",
        targetValue: 30,
        title: "坚持 30 天",
      },
    ]);
  });
});
