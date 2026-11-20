import type { WhiteboardContractEntry } from "./catalog";
import type Board from "../Board";
import { flatten, authorElement } from "./projection";
import type { CanvasBinding } from "./binding";

export function isBlocked(binding: CanvasBinding): boolean {
  return binding.closed || !!binding.conditional || binding.options.canWrite?.() === false;
}

export function assertWritable(binding: CanvasBinding, requirePage = true): Board {
  if (
    binding.closed ||
    binding.conditional ||
    binding.validating ||
    binding.options.canWrite?.() === false ||
    !binding.board ||
    !binding.board.captureSubmission()() ||
    (requirePage && !binding.model.read().pages.some(page => page.id === binding.page))
  )
    throw new Error("白板文档只读、已关闭或页面失效");
  return binding.board;
}

export function canEditElement(binding: CanvasBinding, id: string): boolean {
  if (
    binding.closed ||
    binding.conditional ||
    binding.validating ||
    binding.options.canWrite?.() === false ||
    !binding.board?.captureSubmission()()
  )
    return false;
  const node = flatten(binding.board.children).find(node => node.id === id);
  const identity = binding.model.elements.get(id)?.get("identity") as
    | { contractId: string }
    | undefined;
  if (!node || !identity) return false;
  const entry = binding.options.catalog?.get(identity.contractId);
  if (entry)
    return (
      entryInstalled(binding, entry) &&
      entry.access === "edit" &&
      binding.options.canEditContract?.(entry) !== false
    );
  if (
    binding.options.catalog &&
    (binding.options.catalog.current(node.type) ||
      !binding.board?.extensions?.isHostElement(node.type))
  )
    return false;
  return identity.contractId === binding.options.types[node.type]?.contractId;
}

export function entryInstalled(binding: CanvasBinding, entry: WhiteboardContractEntry): boolean {
  return binding.board?.extensions?.authorOfType(entry.contract.type) === entry.contract.owner;
}

export function supportsElement(binding: CanvasBinding, id: string): boolean {
  const node = authorElement(binding, id);
  if (!node) return false;
  const entry = binding.options.catalog?.get(node.contractId);
  return entry
    ? entryInstalled(binding, entry) && entry.access !== "none"
    : binding.options.types[node.type]?.contractId === node.contractId;
}

export function resolveElementDefinition(binding: CanvasBinding, contractId: string) {
  const entry = binding.options.catalog?.get(contractId);
  return entry && entryInstalled(binding, entry) ? entry : undefined;
}
