/**
 * 主题命名：只从分层 tag（「JavaScript/Symbol」「CSS/定位」）里取，绝不用卡片正文。
 *
 * 正文首句是一句话，不是名字——当主题名显示在地图上既长又被截断，这是上一版的主要观感问题。
 * 规则：
 *  - 大主题取成员 tag 首段的众数（每张卡同一首段只计一次）。真实数据里有「学习方法 / 读书 /
 *    随笔 / 概念」这种首段分散的主题，没有一个过半，也仍取众数：它总比一句正文更像名字。
 *  - 子主题在父主题之下取下一段；tag 首段本身就不是父主题（如「JavaScript」主题里混入的
 *    「DOM/选区」）则取那个首段。覆盖不足就返回空串——子主题照常参与布局，只是不显示名字。
 *    真实数据里约一半 tag 只有一段（直接打「JavaScript」），这类成员给不出子主题名，
 *    覆盖率按「能给出名字的成员」来算。
 */

/** 子主题名至少要覆盖这么多比例的成员才显示，否则宁可不显示 */
const SUBTOPIC_MIN_COVERAGE = 0.25;

/** 分层 tag 的切分：兼容全角斜杠与多余空白 */
export function tagPath(tag: string): string[] {
  return tag
    .split(/[/／]/)
    .map(part => part.trim())
    .filter(Boolean);
}

/** 众数，平票按字典序：同样的输入永远得到同样的名字 */
function mode(counts: Map<string, number>): { value: string; count: number } | null {
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (
      !best ||
      count > best.count ||
      (count === best.count && value.localeCompare(best.value) < 0)
    ) {
      best = { value, count };
    }
  }
  return best;
}

export interface LabelMember {
  tags: string[];
}

/** 大主题名；成员全都没有 tag 时返回空串（渲染层显示为「未命名」） */
export function topicLabel(members: LabelMember[]): string {
  const counts = new Map<string, number>();
  for (const member of members) {
    const heads = new Set(member.tags.map(tag => tagPath(tag)[0]).filter(Boolean));
    for (const head of heads) counts.set(head, (counts.get(head) ?? 0) + 1);
  }
  return mode(counts)?.value ?? "";
}

/** 子主题名；取不到够格的名字返回空串 */
export function subtopicLabel(members: LabelMember[], parentLabel: string): string {
  const counts = new Map<string, number>();
  let nameable = 0;
  for (const member of members) {
    const parts = new Set<string>();
    for (const tag of member.tags) {
      const path = tagPath(tag);
      if (path.length === 0) continue;
      const next = path[0] === parentLabel ? path[1] : path[0];
      if (next && next !== parentLabel) parts.add(next);
    }
    if (parts.size > 0) nameable += 1;
    for (const part of parts) counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  const best = mode(counts);
  if (!best || nameable === 0) return "";
  // 两道门槛：在「能给出名字的成员」里占多数，且在全体成员里不至于只是零星几张
  if (best.count / nameable < 0.5 && best.count / members.length < SUBTOPIC_MIN_COVERAGE) return "";
  if (best.count < 2) return "";
  return best.value;
}
