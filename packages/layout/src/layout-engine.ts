import { Node, DIRECTION_LTR } from "../../flexily/src/index-scriptc.js";
import type { DefaultsPreset } from "../../flexily/src/defaults.js";

/** One surface's node ownership. Geometry is expressed in logical units. */
export class LayoutEngine {
  private nodes = new Set<Node>();
  private disposed: boolean = false;
  private defaults: DefaultsPreset;

  constructor(defaults: DefaultsPreset = "css") {
    this.defaults = defaults;
  }

  createNode(): Node {
    this.assertActive();
    const node = Node.create({ defaults: this.defaults });
    this.nodes.add(node);
    return node;
  }

  calculateLayout(root: Node, width: number, height: number, direction: number = DIRECTION_LTR): void {
    this.assertActive();
    if (!this.nodes.has(root)) throw new Error("Layout root belongs to another engine");
    if (root.getParent() !== null) throw new Error("Layout root must have no parent");
    root.calculateLayout(width, height, direction);
  }

  /** Release a removed subtree, including callback closures and detached nodes. */
  releaseSubtree(root: Node): void {
    this.assertActive();
    const pending: Node[] = [root];
    const subtree: Node[] = [];
    while (pending.length > 0) {
      const node = pending.pop()!;
      if (!this.nodes.has(node)) throw new Error("Layout node belongs to another engine");
      subtree.push(node);
      for (let i = 0; i < node.getChildCount(); i++) pending.push(node.getChild(i)!);
    }
    for (let i = subtree.length - 1; i >= 0; i--) {
      const node = subtree[i]!;
      node.setContainerQueryResolver(null);
      node.free();
      this.nodes.delete(node);
    }
  }

  /** Idempotent teardown, also covering nodes removed from the surface tree. */
  dispose(): void {
    if (this.disposed) return;
    const nodes = [...this.nodes];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!;
      node.setContainerQueryResolver(null);
      node.free();
    }
    this.nodes.clear();
    this.disposed = true;
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("LayoutEngine has been disposed");
  }
}
