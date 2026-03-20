import { describe, it, expect } from "vitest";
import { OperationTreeProvider } from "./operationTreeProvider";
import type { ArmResource, ArmOperation } from "../shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOp(overrides: Partial<ArmOperation> = {}): ArmOperation {
  return {
    name: "getResource",
    kind: "read",
    path: "/providers/Microsoft.Foo/bars/{name}",
    operationGroup: "Bars",
    location: { file: "", line: 0, char: 0 },
    ...overrides,
  };
}

function makeResource(overrides: Partial<ArmResource> = {}): ArmResource {
  return {
    name: "BarResource",
    kind: "Tracked",
    providerNamespace: "Microsoft.Foo",
    resourceType: "Microsoft.Foo/bars",
    resourceInstancePath: "/subscriptions/{sub}/providers/Microsoft.Foo/bars/{name}",
    children: [],
    lifecycleOps: [makeOp()],
    listOps: [],
    actionOps: [],
    associatedOps: [],
    location: { file: "", line: 0, char: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("OperationTreeProvider — initial state", () => {
  it("returns a placeholder when no resource is selected", () => {
    const p = new OperationTreeProvider();
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("placeholder");
  });

  it("clear() resets back to placeholder", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    p.clear();
    const children = p.getChildren() as any[];
    expect(children[0].kind).toBe("placeholder");
  });
});

// ---------------------------------------------------------------------------
// Group rendering
// ---------------------------------------------------------------------------

describe("OperationTreeProvider — groups", () => {
  it("shows Lifecycle group when lifecycleOps are present", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    const groups = p.getChildren() as any[];
    expect(groups.some((g: any) => g.kind === "group" && g.label === "Lifecycle")).toBe(true);
  });

  it("shows List group when listOps are present", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [], listOps: [makeOp({ kind: "list", name: "listAll" })] }));
    const groups = p.getChildren() as any[];
    expect(groups.some((g: any) => g.label === "List")).toBe(true);
  });

  it("shows Actions group when actionOps are present", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [], actionOps: [makeOp({ kind: "action", name: "restart" })] }));
    const groups = p.getChildren() as any[];
    expect(groups.some((g: any) => g.label === "Actions")).toBe(true);
  });

  it("shows Associated group when associatedOps are present", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [], associatedOps: [makeOp({ name: "crossOp" })] }));
    const groups = p.getChildren() as any[];
    expect(groups.some((g: any) => g.label === "Associated")).toBe(true);
  });

  it("groups appear in order: Lifecycle, List, Actions, Associated", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({
      lifecycleOps: [makeOp()],
      listOps: [makeOp({ kind: "list" })],
      actionOps: [makeOp({ kind: "action" })],
      associatedOps: [makeOp({ name: "x" })],
    }));
    const groups = (p.getChildren() as any[]).map((g: any) => g.label);
    expect(groups).toEqual(["Lifecycle", "List", "Actions", "Associated"]);
  });

  it("shows 'No operations defined' placeholder when all op arrays are empty", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [], listOps: [], actionOps: [], associatedOps: [] }));
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("placeholder");
  });

  it("group description shows correct op count", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [makeOp(), makeOp({ name: "get2" })] }));
    const [group] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(group) as any;
    expect(treeItem.description).toBe("2");
  });
});

// ---------------------------------------------------------------------------
// Group expansion → operation items
// ---------------------------------------------------------------------------

describe("OperationTreeProvider — getChildren on group", () => {
  it("returns operation items for a group", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    const [group] = p.getChildren() as any[];
    const ops = p.getChildren(group) as any[];
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("operation");
    expect(ops[0].data.name).toBe("getResource");
  });

  it("returns empty array for an operation item (leaf)", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    const [group] = p.getChildren() as any[];
    const [opItem] = p.getChildren(group) as any[];
    expect(p.getChildren(opItem)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTreeItem — operation
// ---------------------------------------------------------------------------

describe("OperationTreeProvider — getTreeItem (operation)", () => {
  it("sets label, description (path), and contextValue", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    const [group] = p.getChildren() as any[];
    const [opItem] = p.getChildren(group) as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.label).toBe("getResource");
    expect(treeItem.description).toBe("/providers/Microsoft.Foo/bars/{name}");
    expect(treeItem.contextValue).toBe("operation");
  });

  it("sets navigate command when location.file is present", () => {
    const op = makeOp({ location: { file: "/foo/bar.tsp", line: 5, char: 0 } });
    const p = new OperationTreeProvider();
    p.showResource(makeResource({ lifecycleOps: [op] }));
    const [group] = p.getChildren() as any[];
    const [opItem] = p.getChildren(group) as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.command?.command).toBe("typespecGraph.navigateTo");
    expect(treeItem.command?.arguments).toEqual(["/foo/bar.tsp", 5, 0]);
  });

  it("no command when location.file is empty", () => {
    const p = new OperationTreeProvider();
    p.showResource(makeResource());
    const [group] = p.getChildren() as any[];
    const [opItem] = p.getChildren(group) as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.command).toBeUndefined();
  });
});
