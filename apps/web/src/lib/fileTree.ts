// Dựng cây thư mục từ danh sách đường dẫn để hiển thị danh sách file dạng cây (thư mục trước, rồi file, theo ABC).

export type TreeRow = { kind: 'dir' | 'file'; name: string; path: string; depth: number };

type Node = { dirs: Map<string, Node>; files: string[] };

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

export function buildFileTree(paths: string[]): TreeRow[] {
  const root: Node = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      let next = node.dirs.get(dir);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        node.dirs.set(dir, next);
      }
      node = next;
    }
    const name = parts[parts.length - 1];
    if (name) node.files.push(name);
  }
  const rows: TreeRow[] = [];
  const walk = (node: Node, prefix: string, depth: number) => {
    for (const name of [...node.dirs.keys()].sort(byName)) {
      const path = prefix + name;
      rows.push({ kind: 'dir', name, path, depth });
      walk(node.dirs.get(name)!, `${path}/`, depth + 1);
    }
    for (const name of [...node.files].sort(byName)) rows.push({ kind: 'file', name, path: prefix + name, depth });
  };
  walk(root, '', 0);
  return rows;
}
