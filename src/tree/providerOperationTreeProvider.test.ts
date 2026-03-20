import { describe, it, expect } from "vitest";
import { ProviderOperationTreeProvider } from "./providerOperationTreeProvider";
import type { ArmOperation } from "../shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOp(overrides: Partial<ArmOperation> = {}): ArmOperation {
  return {
    name: "checkNameAvailability",
    kind: "action",
    path: "/subscriptions/{sub}/providers/Microsoft.Foo/checkNameAvailability",
    operationGroup: "Foo",
    location: { file: "", line: 0, char: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("ProviderOperationTreeProvider — initial state", () => {
  it("starts in loading state → getChildren returns single loading item", () => {
    const p = new ProviderOperationTreeProvider();
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("loading");
  });
});

// ---------------------------------------------------------------------------
// setOps
// ---------------------------------------------------------------------------

describe("ProviderOperationTreeProvider — setOps", () => {
  it("empty ops array → returns placeholder", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([]);
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("placeholder");
  });

  it("non-empty ops → returns one operation item per op", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([makeOp(), makeOp({ name: "listOp", kind: "list" })]);
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(2);
    expect(children.every((c: any) => c.kind === "operation")).toBe(true);
    expect(children[0].data.name).toBe("checkNameAvailability");
    expect(children[1].data.name).toBe("listOp");
  });

  it("setLoading() after setOps reverts to loading state", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([makeOp()]);
    p.setLoading();
    const children = p.getChildren() as any[];
    expect(children[0].kind).toBe("loading");
  });
});

// ---------------------------------------------------------------------------
// getChildren — operation items are leaf nodes
// ---------------------------------------------------------------------------

describe("ProviderOperationTreeProvider — getChildren on operation", () => {
  it("returns empty array for an operation item (leaf)", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([makeOp()]);
    const [opItem] = p.getChildren() as any[];
    expect(p.getChildren(opItem)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTreeItem
// ---------------------------------------------------------------------------

describe("ProviderOperationTreeProvider — getTreeItem", () => {
  it("loading item has label 'Loading…'", () => {
    const p = new ProviderOperationTreeProvider();
    const [item] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(item) as any;
    expect(treeItem.label).toBe("Loading…");
  });

  it("placeholder item shows message as label", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([]);
    const [item] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(item) as any;
    expect(treeItem.label).toBe("No provider-level operations found.");
  });

  it("operation item has correct label (name) and description (path)", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([makeOp()]);
    const [opItem] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.label).toBe("checkNameAvailability");
    expect(treeItem.description).toBe(
      "/subscriptions/{sub}/providers/Microsoft.Foo/checkNameAvailability"
    );
    expect(treeItem.contextValue).toBe("providerOperation");
  });

  it("operation item sets navigate command when location.file is present", () => {
    const op = makeOp({ location: { file: "/some/file.tsp", line: 42, char: 3 } });
    const p = new ProviderOperationTreeProvider();
    p.setOps([op]);
    const [opItem] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.command?.command).toBe("typespecGraph.navigateTo");
    expect(treeItem.command?.arguments).toEqual(["/some/file.tsp", 42, 3]);
  });

  it("operation item has no command when location.file is empty", () => {
    const p = new ProviderOperationTreeProvider();
    p.setOps([makeOp()]);
    const [opItem] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(opItem) as any;
    expect(treeItem.command).toBeUndefined();
  });
});
