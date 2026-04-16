export type AdminTreeNode<T extends { id: number; parentId: number }> = T & {
  depth: number;
  treeIndent: boolean[];
  hasChildren: boolean;
};

/**
 * 将「父子关系」列表构造成「可直接用于表格渲染」的扁平树（深度优先）。
 * - 输入列表需要包含 id、parentId
 * - 输出列表会按 parentId 递归展开，并附带 depth/treeIndent/hasChildren
 */
export function buildAdminFlatTree<T extends { id: number; parentId: number }>(
  items: T[],
  parentId = 0,
  depth = 0,
): AdminTreeNode<T>[] {
  const children = items.filter((m) => m.parentId === parentId);
  const result: AdminTreeNode<T>[] = [];

  for (const item of children) {
    const sub = buildAdminFlatTree(items, item.id, depth + 1);
    const node = item as AdminTreeNode<T>;
    node.depth = depth;
    node.treeIndent = Array.from({ length: depth }, () => true);
    node.hasChildren = sub.length > 0;
    result.push(node);
    result.push(...sub);
  }

  return result;
}
