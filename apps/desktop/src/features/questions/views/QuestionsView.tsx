/**
 * 问题页 · 三栏清单 A2「顶部切换」（mockups/questions/plan-a-inbox.html 定稿，D-043）：
 * 工具栏（标题 + 状态计数 + 新建）→ 左板（快速收集 → 分组 chips → 三段列表）+ 右板常驻详情。
 * 分组放进列表板做 chips，不与全局侧栏同层。
 *
 * 删除问题、解除关联不二次确认：立即隐藏 + Toast 撤销，5 秒后落库；改状态可撤销（删除对应轨迹事件）。
 * 键盘（本页在栈顶、焦点不在输入 / 按钮 / 浮层内）：↑↓ 切换、1/2/3 设状态、L 关联材料、⌫ 删除。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Layers, Link2, PenLine, Plus, Trash2 } from "lucide-react";
import { MotionConfig } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Loading, Menu, toast, cn } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { isEditableTarget } from "@/page/dom";
import { GroupDialog } from "@/components/GroupDialog";
import { CreateCardDialog } from "@/features/cards/components/CreateCardDialog";
import type { QuestionGroupDTO } from "@/commands/question-group";
import {
  ECardCategory,
  type QuestionMaterial,
  type QuestionStatus,
  type QuestionSummary,
} from "@/types";
import { AnswerDialog, type AnswerDialogState } from "../components/AnswerDialog";
import { CaptureBar } from "../components/CaptureBar";
import { GroupChips } from "../components/GroupChips";
import { MaterialPicker } from "../components/MaterialPicker";
import { MaterialPreviewDialog } from "../components/MaterialPreviewDialog";
import { GroupDot, StatusRing } from "../components/QuestionBits";
import { QuestionDetail } from "../components/QuestionDetail";
import { QuestionList } from "../components/QuestionList";
import {
  SECTION_ORDER,
  canPreview,
  STATUS_META,
  STATUS_STEPS,
  sectionize,
  statusCounts,
} from "../model";
import {
  createMaterialFor,
  questionMutations,
  useQuestionDetail,
  useQuestionsSnapshot,
  type CreatableKind,
  type OpenTarget,
} from "../queries";
import { useDeferredActions } from "../useDeferredActions";

export function QuestionsView() {
  const { navigator } = usePage();
  const params = usePageParams<{ selectedId?: number }>();
  const { snapshot, loading } = useQuestionsSnapshot();
  const now = useMinuteNow();

  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(params.selectedId ?? null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<QuestionStatus>>(
    () => new Set<QuestionStatus>(["resolved"])
  );
  const [groupDialog, setGroupDialog] = useState<{ group: QuestionGroupDTO | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [answerDialog, setAnswerDialog] = useState<AnswerDialogState | null>(null);
  const [preview, setPreview] = useState<QuestionMaterial | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const deferred = useDeferredActions();
  const queryClient = useQueryClient();

  /* 从首页 / 命令面板带 selectedId 进入（或再次进入）时定位：清掉分组筛选、展开所在分段 */
  const located = useRef<number | null>(null);
  useEffect(() => {
    const id = params.selectedId;
    if (id == null || !snapshot || located.current === id) return;
    located.current = id;
    const target = snapshot.questions.find(q => q.id === id);
    if (!target) return;
    setGroupFilter(null);
    setSelectedId(id);
    setCollapsed(prev => {
      if (!prev.has(target.status)) return prev;
      const next = new Set(prev);
      next.delete(target.status);
      return next;
    });
  }, [params.selectedId, snapshot]);

  const detailQuery = useQuestionDetail(selectedId);
  const detail = detailQuery.data?.question.id === selectedId ? detailQuery.data : null;

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const live = snapshot.questions.filter(q => !deferred.pending.has(`q:${q.id}`));
    const visible = groupFilter == null ? live : live.filter(q => q.groupId === groupFilter);
    const sections = sectionize(visible);
    const openCounts = new Map<number, number>();
    live.forEach(q => {
      if (q.status !== "resolved") openCounts.set(q.groupId, (openCounts.get(q.groupId) ?? 0) + 1);
    });
    return {
      sections,
      counts: statusCounts(visible),
      openCounts,
      totalOpen: live.filter(q => q.status !== "resolved").length,
      order: sections.filter(s => !collapsed.has(s.status)).flatMap(s => s.items),
      groupMap: new Map(snapshot.groups.map(g => [g.id, g])),
      byId: new Map(live.map(q => [q.id, q])),
    };
  }, [snapshot, groupFilter, collapsed, deferred.pending]);

  /* 不默认选中；选中项消失（删除 / 筛走）时清空选中 */
  useEffect(() => {
    if (!derived || selectedId == null) return;
    const q = derived.byId.get(selectedId);
    if (q && (groupFilter == null || q.groupId === groupFilter)) return;
    setSelectedId(null);
  }, [derived, selectedId, groupFilter]);

  /* 分组被删后回到「全部」 */
  useEffect(() => {
    if (snapshot && groupFilter != null && !snapshot.groups.some(g => g.id === groupFilter))
      setGroupFilter(null);
  }, [snapshot, groupFilter]);

  /* ---------- 操作 ---------- */

  const setStatus = async (
    question: { id: number; status: QuestionStatus },
    status: QuestionStatus
  ) => {
    if (question.status === status) return;
    const prev = question.status;
    try {
      const updated = await questionMutations.setStatus(question.id, status);
      toast.success(`已标为「${STATUS_META[status].label}」`, {
        action: {
          label: "撤销",
          onClick: () =>
            void questionMutations
              .revertStatus(question.id, prev, updated.eventId)
              .catch(() => toast.error("撤销失败")),
        },
      });
    } catch {
      toast.error("修改状态失败");
    }
  };

  const move = (question: { id: number; groupId: number }, groupId: number) => {
    const prev = question.groupId;
    const title = derived?.groupMap.get(groupId)?.title ?? "";
    questionMutations
      .move(question.id, groupId)
      .then(() =>
        toast.success(`已移动到「${title}」`, {
          action: { label: "撤销", onClick: () => void questionMutations.move(question.id, prev) },
        })
      )
      .catch(() => toast.error("移动失败"));
  };

  const remove = (question: { id: number; questionContent: string }) =>
    deferred.schedule(`q:${question.id}`, "已删除问题（材料本身不受影响）", () =>
      questionMutations.remove(question.id)
    );

  const unlink = (material: QuestionMaterial) =>
    deferred.schedule(
      `m:${material.id}`,
      material.targetType === "answer" ? "已删除答案" : "已解除关联（材料仍保留在库中）",
      () =>
        questionMutations.unlink(material.questionId, {
          targetType: material.targetType,
          targetId: material.targetId,
        })
    );

  const openTarget = (target: OpenTarget) => navigator.push(target.key, target.params);

  const openMaterial = (material: QuestionMaterial) => {
    switch (material.targetType) {
      case "card":
        return openTarget({ key: "card-detail", params: { id: material.targetId } });
      case "article":
        return openTarget({ key: "article-detail", params: { id: material.targetId } });
      case "project":
        return openTarget({ key: "project-detail", params: { id: material.targetId } });
      case "project_item":
        if (material.projectId != null)
          openTarget({
            key: "project-detail",
            params: { id: material.projectId, itemId: material.targetId },
          });
        return;
      case "white_board":
        if (material.boardContentId != null)
          openTarget({ key: "whiteboard-content", params: { id: material.boardContentId } });
        return;
      case "answer":
        if (detail)
          setAnswerDialog({
            mode: "edit",
            questionTitle: detail.question.questionContent,
            contentId: material.targetId,
          });
    }
  };

  const createMaterial = (kind: CreatableKind) => {
    if (!detail) return;
    createMaterialFor(detail.question.id, detail.question.questionContent, kind)
      .then(openTarget)
      .catch(() => toast.error("新建失败"));
  };

  const renderStatusMenu = (question: { id: number; status: QuestionStatus }) => (
    <>
      <Menu.Group>状态</Menu.Group>
      {STATUS_STEPS.map(status => (
        <Menu.Item
          key={status}
          icon={<StatusRing status={status} size="sm" />}
          onSelect={() => void setStatus(question, status)}
        >
          {STATUS_META[status].label}
        </Menu.Item>
      ))}
    </>
  );

  const renderMenu = (question: QuestionSummary | NonNullable<typeof detail>["question"]) => (
    <>
      <Menu.Item
        icon={<Layers className="size-[15px]" strokeWidth={1.75} />}
        onSelect={() => {
          setSelectedId(question.id);
          setCardOpen(true);
        }}
      >
        写一张卡片
      </Menu.Item>
      <Menu.Item
        icon={<PenLine className="size-[15px]" strokeWidth={1.75} />}
        onSelect={() => {
          setSelectedId(question.id);
          setAnswerDialog({ mode: "new", questionTitle: question.questionContent });
        }}
      >
        写答案
      </Menu.Item>
      <Menu.Item
        icon={<Link2 className="size-[15px]" strokeWidth={1.75} />}
        kbd="L"
        onSelect={() => {
          setSelectedId(question.id);
          setPickerOpen(true);
        }}
      >
        关联已有材料…
      </Menu.Item>
      <Menu.Separator />
      <Menu.Submenu label="状态" icon={<StatusRing status={question.status} size="sm" />}>
        {STATUS_STEPS.map(status => (
          <Menu.Item
            key={status}
            icon={<StatusRing status={status} size="sm" />}
            onSelect={() => void setStatus(question, status)}
          >
            {STATUS_META[status].label}
          </Menu.Item>
        ))}
      </Menu.Submenu>
      {(snapshot?.groups.length ?? 0) > 1 && (
        <Menu.Submenu
          label="移动到"
          icon={<ArrowRightLeft className="size-[15px]" strokeWidth={1.75} />}
        >
          {snapshot!.groups
            .filter(g => g.id !== question.groupId)
            .map(g => (
              <Menu.Item
                key={g.id}
                icon={<GroupDot color={g.color} />}
                onSelect={() => move(question, g.id)}
              >
                {g.title}
              </Menu.Item>
            ))}
        </Menu.Submenu>
      )}
      <Menu.Separator />
      <Menu.Item
        danger
        kbd="⌫"
        icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
        onSelect={() => remove(question)}
      >
        删除问题
      </Menu.Item>
    </>
  );

  /* ---------- 键盘 ---------- */
  const keyState = useRef({ derived, selectedId, detail });
  keyState.current = { derived, selectedId, detail };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (navigator.current()?.key !== "questions") return;
      const target = e.target;
      if (
        isEditableTarget(target) ||
        (target instanceof Element &&
          target.closest("[role=menu], [role=dialog], [data-float-card], [contenteditable=true]"))
      )
        return;
      const { derived: d, selectedId: sel, detail: current } = keyState.current;
      if (!d) return;
      const idx = d.order.findIndex(q => q.id === sel);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next =
          d.order[
            Math.max(0, Math.min(d.order.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))
          ];
        if (next) setSelectedId(next.id);
      } else if (current && /^[1-3]$/.test(e.key)) {
        void setStatus(current.question, STATUS_STEPS[Number(e.key) - 1]);
      } else if (current && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setPickerOpen(true);
      } else if (current && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        const neighbour = d.order[idx + 1] ?? d.order[idx - 1];
        remove(current.question);
        setSelectedId(neighbour?.id ?? null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigator]);

  if (loading || !snapshot || !derived) return <Loading />;

  const groups = snapshot.groups;
  const defaultGroup = groups.find(g => g.isDefault) ?? groups[0];
  const fallbackGroup =
    groupFilter != null ? (derived.groupMap.get(groupFilter) ?? defaultGroup) : defaultGroup;
  const filterTitle = groupFilter != null ? derived.groupMap.get(groupFilter)?.title : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex h-full max-w-[1720px] flex-col px-[26px] pb-4">
        <div className="flex h-[44px] flex-none items-center gap-3">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">问题</h1>
          <span className="text-ink-2 text-tau-meta tabular-nums">
            {filterTitle && <>{filterTitle} · </>}
            {SECTION_ORDER.map((status, i) => (
              <span key={status}>
                {i > 0 && " · "}
                {STATUS_META[status].label}{" "}
                <b className="text-ink-1 font-semibold">{derived.counts[status]}</b>
              </span>
            ))}
          </span>
          <span className="flex-1" />
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => captureRef.current?.focus()}
          >
            新建问题
          </Button>
        </div>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-4 pt-1",
            selectedId != null
              ? "grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)]"
              : "grid-cols-[minmax(0,1fr)]"
          )}
        >
          <div className="bg-surface shadow-card flex min-h-0 flex-col overflow-hidden rounded-[16px] px-3.5 pb-2 pt-3.5">
            <CaptureBar
              groups={groups}
              fallbackGroup={fallbackGroup}
              inputRef={captureRef}
              onSubmit={async (title, groupHint) => {
                const { question, groupTitle } = await questionMutations.capture(title, groupHint);
                // 等列表重拉后再选中，避免「选中项不在列表」被回落到第一项
                await queryClient.refetchQueries({ queryKey: ["questions", "snapshot"] });
                setSelectedId(question.id);
                setCollapsed(prev => {
                  const next = new Set(prev);
                  next.delete("not_started");
                  return next;
                });
                toast.success(`已收集到「${groupTitle}」`);
              }}
            />
            <GroupChips
              groups={groups}
              openCounts={derived.openCounts}
              totalOpen={derived.totalOpen}
              value={groupFilter}
              onChange={setGroupFilter}
              onCreate={() => setGroupDialog({ group: null })}
              onEdit={group => setGroupDialog({ group })}
              onDelete={group =>
                void questionMutations
                  .deleteGroup(group.id)
                  .then(() => toast.success(`已删除分组「${group.title}」，其中的问题移到默认分组`))
                  .catch(() => toast.error("删除分组失败"))
              }
              onDropQuestion={(id, groupId) => {
                const q = derived.byId.get(id);
                if (q && q.groupId !== groupId) move(q, groupId);
              }}
            />
            <QuestionList
              sections={derived.sections}
              groups={derived.groupMap}
              showGroup={groupFilter == null}
              selectedId={selectedId}
              collapsed={collapsed}
              now={now}
              onToggleSection={status =>
                setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(status)) next.delete(status);
                  else next.add(status);
                  return next;
                })
              }
              onSelect={q => setSelectedId(prev => (prev === q.id ? null : q.id))}
              renderStatusMenu={renderStatusMenu}
              renderMenu={renderMenu}
              empty={
                <p className="text-ink-3 py-10 text-center text-[12.5px]">
                  {groupFilter == null
                    ? "还没有问题。学习时冒出的疑问，在上面记下来。"
                    : "这个分组还没有问题。"}
                </p>
              }
            />
            <div className="text-ink-3 flex flex-none flex-wrap gap-3 px-2 pt-2 text-[11.5px]">
              <KeyHint keys={["↑", "↓"]} label="切换" />
              <KeyHint keys={["1", "2", "3"]} label="设状态" />
              <KeyHint keys={["L"]} label="关联材料" />
              <KeyHint keys={["⌫"]} label="删除" />
            </div>
          </div>

          {selectedId != null && (
            <div className="bg-surface shadow-card flex min-h-0 flex-col overflow-hidden rounded-[16px] px-6 pb-3 pt-[18px]">
              {detail ? (
                <QuestionDetail
                  key={detail.question.id}
                  detail={detail}
                  groups={groups}
                  hiddenMaterials={
                    new Set(
                      detail.materials.filter(m => deferred.pending.has(`m:${m.id}`)).map(m => m.id)
                    )
                  }
                  now={now}
                  onSetStatus={status => void setStatus(detail.question, status)}
                  onMove={groupId => move(detail.question, groupId)}
                  onOpenMaterial={openMaterial}
                  onClickMaterial={material =>
                    canPreview(material) ? setPreview(material) : openMaterial(material)
                  }
                  onUnlink={unlink}
                  onWriteCard={() => setCardOpen(true)}
                  onWriteAnswer={() =>
                    setAnswerDialog({ mode: "new", questionTitle: detail.question.questionContent })
                  }
                  onCreate={createMaterial}
                  onLink={() => setPickerOpen(true)}
                  menu={renderMenu(detail.question)}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <Loading />
              )}
            </div>
          )}
        </div>

        <GroupDialog
          open={groupDialog !== null}
          group={groupDialog?.group ?? null}
          noun="分组"
          placeholder="例如：编辑器原理"
          onClose={() => setGroupDialog(null)}
          onSubmit={async (title, color) => {
            if (groupDialog?.group) {
              await questionMutations.updateGroup(groupDialog.group.id, title, color);
              toast.success("分组已更新");
            } else {
              const created = await questionMutations.createGroup(title, color);
              if (created) setGroupFilter(created.id);
              toast.success(`已创建分组「${title}」`);
            }
          }}
        />
        <MaterialPicker
          open={pickerOpen}
          questionId={detail?.question.id ?? null}
          questionTitle={detail?.question.questionContent ?? ""}
          now={now}
          onClose={() => setPickerOpen(false)}
          onConfirm={async targets => {
            if (!detail) return;
            try {
              const added = await questionMutations.link(detail.question.id, targets);
              toast.success(`已关联 ${added.length} 份材料`);
            } catch {
              toast.error("关联失败");
              throw new Error("link failed");
            }
          }}
        />
        <CreateCardDialog
          open={cardOpen}
          defaultCategory={ECardCategory.Temporary}
          onClose={() => setCardOpen(false)}
          onCreated={card => {
            if (!detail) return;
            questionMutations
              .link(detail.question.id, [{ targetType: "card", targetId: card.id }], true)
              .catch(() => toast.error("卡片已保存，但挂到问题上失败"));
          }}
        />
        <MaterialPreviewDialog
          material={preview}
          now={now}
          onClose={() => setPreview(null)}
          onOpen={openMaterial}
        />
        <AnswerDialog
          state={answerDialog}
          onClose={() => setAnswerDialog(null)}
          onCreate={async content => {
            if (!detail) return;
            await questionMutations.writeAnswer(detail.question.id, content);
            toast.success("答案已保存");
          }}
        />
      </div>
    </MotionConfig>
  );
}

function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map(k => (
        <kbd
          key={k}
          className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-px font-mono text-[10.5px]"
        >
          {k}
        </kbd>
      ))}
      {label}
    </span>
  );
}

/** 相对时间（今天 / 昨天）跨零点后自动刷新 */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
