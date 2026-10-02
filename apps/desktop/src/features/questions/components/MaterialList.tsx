/**
 * 材料行：中性墨色类型图标 + 真实标题 + 两行摘要 + 元信息。
 * 点行预览（onClick），悬停时右上角叠加「打开 / 解除关联」（绝对定位叠放，不改变行尺寸）；
 * 目标已删除的材料灰显，只能解除；源端已删除的划线保留原文、不可打开。
 */

import { ExternalLink, PenLine, Unlink } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import { ENTITY_KIND_META } from "@/features/context/model";
import { openEntity } from "@/services/open-content";
import type { QuestionMaterial } from "@/types";
import { TARGET_META, canOpenMaterial, materialMeta, relativeDay } from "../model";

export function MaterialList({
  materials,
  now,
  onClick,
  onOpen,
  onUnlink,
}: {
  materials: QuestionMaterial[];
  now: number;
  onClick(material: QuestionMaterial): void;
  onOpen(material: QuestionMaterial): void;
  onUnlink(material: QuestionMaterial): void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {materials.map(material => (
        <MaterialRow
          key={material.id}
          material={material}
          now={now}
          onClick={() => onClick(material)}
          onOpen={() => onOpen(material)}
          onUnlink={() => onUnlink(material)}
        />
      ))}
    </div>
  );
}

function MaterialRow({
  material,
  now,
  onClick,
  onOpen,
  onUnlink,
}: {
  material: QuestionMaterial;
  now: number;
  onClick(): void;
  onOpen(): void;
  onUnlink(): void;
}) {
  const meta = TARGET_META[material.targetType];
  const Icon = meta.icon;
  const isAnswer = material.targetType === "answer";
  const openable = canOpenMaterial(material);
  const info = [meta.label, materialMeta(material), relativeDay(material.targetCreateTime, now)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={!openable}
      onClick={openable ? onClick : undefined}
      onKeyDown={e => {
        if (e.key === "Enter" && openable) onClick();
      }}
      className={cn(
        "bg-surface border-line-1 group/mat relative flex gap-[11px] rounded-[12px] border px-3 py-[11px] outline-none",
        "ease-tau-out transition-[border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        material.missing ? "opacity-60" : openable && "hover:border-ink-3 cursor-pointer"
      )}
    >
      <span className="text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
        <Icon className="size-[14px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-normal">
          {material.missing ? `${meta.label}已删除` : material.title}
        </div>
        {!material.missing && material.excerpt && (
          <div className="text-ink-2 mt-[3px] line-clamp-2 text-[12.5px] leading-[1.65]">
            {material.excerpt}
          </div>
        )}
        <div className="text-ink-3 mt-1 text-[11.5px]">
          {material.missing ? "原内容已不存在，可解除关联" : info}
          {!material.missing &&
            material.projections?.map(ref => (
              <button
                key={`${ref.kind}:${ref.id}`}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  void openEntity(ref);
                }}
                className="text-ink-2 hover:text-ink-1 ml-1.5 underline-offset-2 outline-none hover:underline focus-visible:shadow-[var(--tau-focus-ring)]"
              >
                也是{ENTITY_KIND_META[ref.kind].label}
              </button>
            ))}
        </div>
      </div>
      <div className="bg-surface absolute right-2 top-2 flex gap-0.5 rounded-[8px] opacity-0 transition-opacity duration-150 group-focus-within/mat:opacity-100 group-hover/mat:opacity-100">
        {openable && (
          <IconButton
            title={isAnswer ? "编辑" : `打开${meta.label}`}
            onClick={e => {
              e.stopPropagation();
              onOpen();
            }}
            className="size-[22px] rounded-[6px]"
          >
            {isAnswer ? (
              <PenLine className="size-[13px]" strokeWidth={1.75} />
            ) : (
              <ExternalLink className="size-[13px]" strokeWidth={1.75} />
            )}
          </IconButton>
        )}
        <IconButton
          title={isAnswer ? "删除答案" : "解除关联"}
          onClick={e => {
            e.stopPropagation();
            onUnlink();
          }}
          className="size-[22px] rounded-[6px]"
        >
          <Unlink className="size-[13px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
