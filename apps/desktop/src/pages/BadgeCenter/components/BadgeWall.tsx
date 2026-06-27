import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, HeartCrack } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeAward, BadgeDefinition } from "@/types";
import Segmented from "./Segmented";
import BadgeMedal from "./BadgeMedal";
import EmptyState, { BadgeSkeleton } from "./EmptyState";

type WallFilter = "all" | "success" | "failure";

export interface BadgeWallProps {
  awards: BadgeAward[];
  definitions: BadgeDefinition[];
  loading: boolean;
  onEmptyCta: () => void;
  onMedalClick?: (award: BadgeAward, definition?: BadgeDefinition) => void;
}

const BadgeWall = ({
  awards,
  definitions,
  loading,
  onEmptyCta,
  onMedalClick,
}: BadgeWallProps) => {
  const themeColors = useThemeColors();
  const [filter, setFilter] = useState<WallFilter>("all");
  const [failureExpanded, setFailureExpanded] = useState(false);

  const definitionMap = useMemo(() => {
    const map = new Map<number, BadgeDefinition>();
    definitions.forEach((d) => map.set(d.id, d));
    return map;
  }, [definitions]);

  const successAwards = useMemo(
    () => awards.filter((a) => a.awardKind === "success"),
    [awards],
  );
  const failureAwards = useMemo(
    () => awards.filter((a) => a.awardKind === "failure"),
    [awards],
  );

  const visibleSuccess = filter === "failure" ? [] : successAwards;
  const visibleFailure = filter === "success" ? [] : failureAwards;

  if (loading) {
    return (
      <section
        className={`rounded-3xl border p-6 backdrop-blur ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
      >
        <BadgeSkeleton count={6} />
      </section>
    );
  }

  if (awards.length === 0) {
    return (
      <EmptyState
        title="还没有徽章记录"
        description="创建你的第一个目标，让每一次坚持都留下证据。"
        ctaLabel="新建徽章"
        onCta={onEmptyCta}
      />
    );
  }

  return (
    <section
      className={`rounded-3xl border p-6 backdrop-blur ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className={`m-0 text-xl font-semibold ${themeColors.activeTextClass}`}
          >
            徽章墙
          </h2>
          <p className={`mt-1 text-sm ${themeColors.secondaryTextClass}`}>
            成功与失败都会留下证据，目标才有真实反馈。
          </p>
        </div>
        <Segmented<WallFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部" },
            { value: "success", label: "成功" },
            { value: "failure", label: "失败" },
          ]}
        />
      </div>

      {/* 成功徽章 */}
      {visibleSuccess.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibleSuccess.map((award, idx) => (
              <BadgeMedal
                key={award.id}
                award={award}
                definition={definitionMap.get(award.definitionId)}
                index={idx}
                onClick={() =>
                  onMedalClick?.(award, definitionMap.get(award.definitionId))
                }
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 失败徽章分区 */}
      {visibleFailure.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setFailureExpanded((v) => !v)}
            className={`flex w-full items-center justify-between rounded-2xl border px-5 py-3 transition ${themeColors.borderClass} ${themeColors.tagBgClass}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                <HeartCrack size={15} />
              </div>
              <span
                className={`text-sm font-medium ${themeColors.activeTextClass}`}
              >
                失败记录 · {visibleFailure.length}
              </span>
            </div>
            <motion.span animate={{ rotate: failureExpanded ? 180 : 0 }}>
              <ChevronDown
                size={16}
                className={themeColors.secondaryTextClass}
              />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {failureExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {visibleFailure.map((award, idx) => (
                      <BadgeMedal
                        key={award.id}
                        award={award}
                        definition={definitionMap.get(award.definitionId)}
                        index={idx}
                        onClick={() =>
                          onMedalClick?.(
                            award,
                            definitionMap.get(award.definitionId),
                          )
                        }
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {filter !== "all" &&
        visibleSuccess.length === 0 &&
        visibleFailure.length === 0 && (
          <div
            className={`rounded-2xl border border-dashed px-4 py-10 text-center text-sm ${themeColors.borderClass} ${themeColors.secondaryTextClass}`}
          >
            暂无符合筛选的徽章。
          </div>
        )}
    </section>
  );
};

export default BadgeWall;
