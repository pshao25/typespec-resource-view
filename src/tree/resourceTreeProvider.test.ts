import { describe, it, expect } from "vitest";
import { ResourceTreeProvider } from "./resourceTreeProvider";
import type { ProviderData, ArmResource } from "../shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(overrides: Partial<ArmResource> = {}): ArmResource {
  return {
    name: "FooResource",
    kind: "Tracked",
    providerNamespace: "Microsoft.Foo",
    resourceType: "Microsoft.Foo/foos",
    resourceInstancePath: "/subscriptions/{sub}/providers/Microsoft.Foo/foos/{name}",
    children: [],
    lifecycleOps: [],
    listOps: [],
    actionOps: [],
    associatedOps: [],
    location: { file: "", line: 0, char: 0 },
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderData> = {}): ProviderData {
  return {
    namespace: "Microsoft.Foo",
    resources: [makeResource()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State machine tests
// ---------------------------------------------------------------------------

describe("ResourceTreeProvider — state machine", () => {
  it("starts in loading state → getChildren returns single loading item", () => {
    const p = new ResourceTreeProvider();
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("loading");
  });

  it("setError → getChildren returns single error item with message", () => {
    const p = new ResourceTreeProvider();
    p.setError("Something went wrong");
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("error");
    expect(children[0].message).toBe("Something went wrong");
  });

  it("setEmpty → getChildren returns single empty item with message", () => {
    const p = new ResourceTreeProvider();
    p.setEmpty("No resources found.");
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("empty");
    expect(children[0].message).toBe("No resources found.");
  });

  it("setData with empty array → returns empty placeholder", () => {
    const p = new ResourceTreeProvider();
    p.setData([]);
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe("empty");
  });

  it("setData with providers → returns provider items", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider(), makeProvider({ namespace: "Microsoft.Bar" })]);
    const children = p.getChildren() as any[];
    expect(children).toHaveLength(2);
    expect(children[0].kind).toBe("provider");
    expect(children[0].data.namespace).toBe("Microsoft.Foo");
    expect(children[1].data.namespace).toBe("Microsoft.Bar");
  });
});

// ---------------------------------------------------------------------------
// getChildren — provider / resource expansion
// ---------------------------------------------------------------------------

describe("ResourceTreeProvider — getChildren", () => {
  it("expanding a provider returns its resources as resource items", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);

    const [provItem] = p.getChildren() as any[];
    const resourceChildren = p.getChildren(provItem) as any[];
    expect(resourceChildren).toHaveLength(1);
    expect(resourceChildren[0].kind).toBe("resource");
    expect(resourceChildren[0].data.name).toBe("FooResource");
  });

  it("expanding a resource with children returns child resource items", () => {
    const child = makeResource({ name: "ChildResource" });
    const parent = makeResource({ name: "ParentResource", children: [child] });
    const p = new ResourceTreeProvider();
    p.setData([makeProvider({ resources: [parent] })]);

    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const childItems = p.getChildren(resItem) as any[];
    expect(childItems).toHaveLength(1);
    expect(childItems[0].kind).toBe("resource");
    expect(childItems[0].data.name).toBe("ChildResource");
  });

  it("expanding a leaf resource returns empty array", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);

    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const leafChildren = p.getChildren(resItem) as any[];
    expect(leafChildren).toEqual([]);
  });

  it("getChildren on a loading/error/empty item returns empty array", () => {
    const p = new ResourceTreeProvider();
    const loadingItem = (p.getChildren() as any[])[0];
    expect(p.getChildren(loadingItem)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTreeItem — label / description / contextValue
// ---------------------------------------------------------------------------

describe("ResourceTreeProvider — getTreeItem", () => {
  it("loading item has label 'Loading…'", () => {
    const p = new ResourceTreeProvider();
    const [item] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(item) as any;
    expect(treeItem.label).toBe("Loading…");
  });

  it("error item has label 'Error' and description set to message", () => {
    const p = new ResourceTreeProvider();
    p.setError("Boom");
    const [item] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(item) as any;
    expect(treeItem.label).toBe("Error");
    expect(treeItem.description).toBe("Boom");
  });

  it("provider item shows namespace as label and resource count in description", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(provItem) as any;
    expect(treeItem.label).toBe("Microsoft.Foo");
    expect(treeItem.description).toBe("1 resource");
    expect(treeItem.contextValue).toBe("provider");
  });

  it("provider shows 'N resources' (plural) for multiple resources", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider({ resources: [makeResource(), makeResource({ name: "Bar" })] })]);
    const [provItem] = p.getChildren() as any[];
    const treeItem = p.getTreeItem(provItem) as any;
    expect(treeItem.description).toBe("2 resources");
  });

  it("resource item label shows name only, description shows kind", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const treeItem = p.getTreeItem(resItem) as any;
    expect(treeItem.label).toBe("FooResource");
    expect(treeItem.description).toBe("Tracked");
    expect(treeItem.contextValue).toBe("resource");
  });

  it("resource item tooltip contains resourceType and path", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const treeItem = p.getTreeItem(resItem) as any;
    expect(treeItem.tooltip.value).toContain("Microsoft.Foo/foos");
    expect(treeItem.tooltip.value).toContain("/subscriptions/{sub}/providers/Microsoft.Foo/foos/{name}");
  });

  it("resource with source location has a command set", () => {
    const res = makeResource({ location: { file: "/path/to/foo.tsp", line: 10, char: 2 } });
    const p = new ResourceTreeProvider();
    p.setData([makeProvider({ resources: [res] })]);
    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const treeItem = p.getTreeItem(resItem) as any;
    expect(treeItem.command).toBeDefined();
    expect(treeItem.command.command).toBe("typespecGraph.navigateTo");
    expect(treeItem.command.arguments).toEqual(["/path/to/foo.tsp", 10, 2]);
  });

  it("resource without source location has no command", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    const treeItem = p.getTreeItem(resItem) as any;
    expect(treeItem.command).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getParent
// ---------------------------------------------------------------------------

describe("ResourceTreeProvider — getParent", () => {
  it("returns parent for a resource item", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    const [resItem] = p.getChildren(provItem) as any[];
    expect(p.getParent(resItem)).toBe(provItem);
  });

  it("returns undefined for a provider item", () => {
    const p = new ResourceTreeProvider();
    p.setData([makeProvider()]);
    const [provItem] = p.getChildren() as any[];
    expect(p.getParent(provItem)).toBeUndefined();
  });
});
