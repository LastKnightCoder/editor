/** 文档树路径比较，不依赖文本编辑器。 */
export const TreePath = {
  equals(left: readonly number[], right: readonly number[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  },
  isAncestor(parent: readonly number[], child: readonly number[]) {
    return parent.length < child.length && parent.every((value, index) => value === child[index]);
  },
  endsBefore(left: readonly number[], right: readonly number[]) {
    const depth = left.length - 1;
    return (
      depth >= 0 &&
      TreePath.equals(left.slice(0, depth), right.slice(0, depth)) &&
      left[depth] < right[depth]
    );
  },
  isSibling(left: readonly number[], right: readonly number[]) {
    return (
      left.length === right.length &&
      left.at(-1) !== right.at(-1) &&
      TreePath.equals(left.slice(0, -1), right.slice(0, -1))
    );
  },
};
