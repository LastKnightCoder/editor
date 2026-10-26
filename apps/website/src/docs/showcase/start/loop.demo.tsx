/** 首页导览：知识的六个环节，点击一个环节查看对应的功能与文档 */
import { useState } from "react";
import {
  BookMarked,
  FileText,
  FlaskConical,
  Footprints,
  Layers,
  Map as MapIcon,
  Repeat,
  Send,
  Users,
  Globe,
  Presentation,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { DocLinkButton } from "../DocLinkButton.tsx";

interface Stage {
  name: string;
  verb: string;
  line: string;
  features: { icon: LucideIcon; label: string }[];
  docs: { slug: string; title: string }[];
}

const STAGES: Stage[] = [
  {
    name: "输入",
    verb: "收集资料",
    line: "在网页、PDF 和微信读书中划线、批注，内容保存到 Tau 并保留出处。",
    features: [
      { icon: Globe, label: "Tau 伴读" },
      { icon: BookMarked, label: "PDF 划线" },
    ],
    docs: [{ slug: "reading", title: "收集与阅读" }],
  },
  {
    name: "消化",
    verb: "理解资料",
    line: "围绕一组资料向 AI 提问，并把理解的内容整理成大纲、重点或测验。",
    features: [{ icon: FlaskConical, label: "Notebook" }],
    docs: [{ slug: "notebook", title: "Notebook" }],
  },
  {
    name: "输出",
    verb: "写下想法",
    line: "用卡片记录短小的想法，用文章写长篇，用项目把一个主题整理成一套文档。",
    features: [
      { icon: Layers, label: "卡片" },
      { icon: FileText, label: "文章" },
      { icon: FolderKanban, label: "项目" },
      { icon: Presentation, label: "白板" },
    ],
    docs: [
      { slug: "cards", title: "卡片" },
      { slug: "articles", title: "文章" },
      { slug: "projects", title: "项目" },
    ],
  },
  {
    name: "复习",
    verb: "巩固记忆",
    line: "把需要记住的内容做成闪卡，按记忆规律安排复习；用漫步随机回顾旧内容。",
    features: [
      { icon: Repeat, label: "闪卡复习" },
      { icon: Footprints, label: "漫步" },
    ],
    docs: [
      { slug: "flashcards", title: "闪卡复习" },
      { slug: "walk", title: "漫步与知识地图" },
    ],
  },
  {
    name: "总览",
    verb: "查看关联",
    line: "在知识地图上查看所有内容，相关的内容按主题聚在一起，并显示引用关系。",
    features: [{ icon: MapIcon, label: "知识地图" }],
    docs: [{ slug: "walk", title: "漫步与知识地图" }],
  },
  {
    name: "分享",
    verb: "发布与协作",
    line: "把内容发布为自己的网站，或邀请别人一起实时编辑。",
    features: [
      { icon: Send, label: "发布" },
      { icon: Users, label: "协作" },
    ],
    docs: [
      { slug: "publish", title: "发布" },
      { slug: "collaboration", title: "协作" },
    ],
  },
];

export default function LoopDemo() {
  const [index, setIndex] = useState(2);
  const stage = STAGES[index];
  return (
    <div className="border-line-1 bg-surface shadow-card rounded-[16px] border p-5 max-sm:p-4">
      <div
        role="tablist"
        aria-label="知识的六个环节"
        className="grid grid-cols-6 gap-1.5 max-sm:grid-cols-3"
      >
        {STAGES.map((item, itemIndex) => {
          const on = itemIndex === index;
          return (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setIndex(itemIndex)}
              onMouseEnter={() => setIndex(itemIndex)}
              className={cn(
                "group relative flex flex-col items-center gap-1 rounded-[12px] px-2 py-3 transition-colors duration-200",
                on ? "bg-accent-soft" : "hover:bg-hover"
              )}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums transition-colors",
                  on ? "text-accent-text" : "text-ink-3"
                )}
              >
                0{itemIndex + 1}
              </span>
              <span className={cn("text-[15px] font-semibold", on ? "text-ink-1" : "text-ink-2")}>
                {item.name}
              </span>
              <span className="text-ink-3 text-[12px]">{item.verb}</span>
            </button>
          );
        })}
      </div>
      {/* 进度线：选中段之前的都点亮，表示想法一路走到这里 */}
      <div className="bg-line-1 relative mx-3 mt-3 h-[3px] overflow-hidden rounded-full">
        <div
          className="bg-accent ease-tau-out absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${((index + 1) / STAGES.length) * 100}%` }}
        />
      </div>
      <div key={stage.name} className="animate-doc-in mt-5 flex gap-6 max-sm:flex-col max-sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-ink-1 text-[16px] leading-relaxed">{stage.line}</p>
          <p className="text-ink-3 mt-3 text-[13px]">
            相关文档：
            {stage.docs.map((doc, docIndex) => (
              <span key={doc.slug}>
                {docIndex > 0 && "、"}
                <DocLinkButton slug={doc.slug} className="font-medium">
                  {doc.title}
                </DocLinkButton>
              </span>
            ))}
          </p>
        </div>
        <ul className="flex shrink-0 flex-wrap content-start gap-2 sm:w-[240px] sm:justify-end">
          {stage.features.map(feature => {
            const Icon = feature.icon;
            return (
              <li
                key={feature.label}
                className="bg-page text-ink-2 border-line-1 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]"
              >
                <Icon size={14} strokeWidth={1.75} className="text-accent-text" />
                {feature.label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
