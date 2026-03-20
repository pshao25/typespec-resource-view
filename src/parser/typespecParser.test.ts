import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import {
  normalizeKind,
  normalizeOpKind,
  buildOperation,
  buildResource,
  pathToFileUrl,
  findEntryPoint,
} from "./typespecParser";

// ---------------------------------------------------------------------------
// normalizeKind
// ---------------------------------------------------------------------------

describe("normalizeKind", () => {
  it("returns known kinds unchanged", () => {
    const known = ["Tracked", "Proxy", "Extension", "Virtual", "Custom", "BuiltIn", "Other"] as const;
    for (const k of known) {
      expect(normalizeKind(k)).toBe(k);
    }
  });

  it("maps undefined to Other", () => {
    expect(normalizeKind(undefined)).toBe("Other");
  });

  it("maps unknown string to Other", () => {
    expect(normalizeKind("SomethingWeird")).toBe("Other");
  });
});

// ---------------------------------------------------------------------------
// normalizeOpKind
// ---------------------------------------------------------------------------

describe("normalizeOpKind", () => {
  it("returns known op kinds unchanged", () => {
    const known = [
      "read", "createOrUpdate", "update", "delete", "checkExistence",
      "list", "action", "other",
    ] as const;
    for (const k of known) {
      expect(normalizeOpKind(k)).toBe(k);
    }
  });

  it("maps undefined to other", () => {
    expect(normalizeOpKind(undefined)).toBe("other");
  });

  it("maps unknown string to other", () => {
    expect(normalizeOpKind("unknownOp")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// pathToFileUrl
// ---------------------------------------------------------------------------

describe("pathToFileUrl", () => {
  it("converts a POSIX absolute path", () => {
    expect(pathToFileUrl("/foo/bar/index.js")).toBe("file:///foo/bar/index.js");
  });

  it("converts a Windows absolute path (backslashes → forward slashes)", () => {
    expect(pathToFileUrl("C:\\Users\\foo\\bar.js")).toBe("file:///C:/Users/foo/bar.js");
  });
});

// ---------------------------------------------------------------------------
// buildOperation
// ---------------------------------------------------------------------------

describe("buildOperation", () => {
  it("maps all fields from a well-formed op object", () => {
    const raw = {
      name: "listBySubscription",
      kind: "list",
      path: "/subscriptions/{subscriptionId}/providers/Microsoft.Foo/bars",
      operationGroup: "Bars",
      operation: { node: null },
    };
    const op = buildOperation(raw);
    expect(op.name).toBe("listBySubscription");
    expect(op.kind).toBe("list");
    expect(op.path).toBe("/subscriptions/{subscriptionId}/providers/Microsoft.Foo/bars");
    expect(op.operationGroup).toBe("Bars");
    expect(op.location).toEqual({ file: "", line: 0, char: 0 });
  });

  it("falls back to op.operation.name when top-level name is missing", () => {
    const raw = { operation: { name: "fallbackName", node: null } };
    const op = buildOperation(raw);
    expect(op.name).toBe("fallbackName");
  });

  it("falls back to 'unknown' when no name anywhere", () => {
    const op = buildOperation({});
    expect(op.name).toBe("unknown");
  });

  it("uses httpOperation.path when path is missing", () => {
    const raw = { httpOperation: { path: "/fallback/path" } };
    const op = buildOperation(raw);
    expect(op.path).toBe("/fallback/path");
  });

  it("normalises unknown op kind to 'other'", () => {
    const op = buildOperation({ kind: "bogusKind" });
    expect(op.kind).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// buildResource
// ---------------------------------------------------------------------------

describe("buildResource", () => {
  const baseRaw = {
    resourceName: "VirtualMachine",
    kind: "Tracked",
    providerNamespace: "Microsoft.Compute",
    resourceType: { provider: "Microsoft.Compute", types: ["virtualMachines"] },
    resourceInstancePath: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{name}",
    operations: {
      lifecycle: {
        read: [{ name: "get", kind: "read", path: "/vm/{name}", operationGroup: "VMs", operation: { node: null } }],
        createOrUpdate: [],
        update: [],
        delete: [],
        checkExistence: [],
      },
      lists: [],
      actions: [],
    },
    associatedOperations: [],
    type: { node: null },
  };

  it("sets basic fields correctly", () => {
    const r = buildResource(baseRaw);
    expect(r.name).toBe("VirtualMachine");
    expect(r.kind).toBe("Tracked");
    expect(r.providerNamespace).toBe("Microsoft.Compute");
    expect(r.resourceType).toBe("Microsoft.Compute/virtualMachines");
    expect(r.children).toEqual([]);
  });

  it("parses lifecycle ops", () => {
    const r = buildResource(baseRaw);
    expect(r.lifecycleOps).toHaveLength(1);
    expect(r.lifecycleOps[0].name).toBe("get");
    expect(r.lifecycleOps[0].kind).toBe("read");
  });

  it("parses list ops", () => {
    const raw = {
      ...baseRaw,
      operations: {
        ...baseRaw.operations,
        lists: [{ name: "listAll", kind: "list", path: "/vm", operationGroup: "VMs", operation: { node: null } }],
      },
    };
    const r = buildResource(raw);
    expect(r.listOps).toHaveLength(1);
    expect(r.listOps[0].name).toBe("listAll");
  });

  it("parses action ops", () => {
    const raw = {
      ...baseRaw,
      operations: {
        ...baseRaw.operations,
        actions: [{ name: "restart", kind: "action", path: "/vm/{name}/restart", operationGroup: "VMs", operation: { node: null } }],
      },
    };
    const r = buildResource(raw);
    expect(r.actionOps).toHaveLength(1);
    expect(r.actionOps[0].name).toBe("restart");
  });

  it("parses associatedOperations", () => {
    const raw = {
      ...baseRaw,
      associatedOperations: [
        { name: "crossOp", kind: "action", path: "/other", operationGroup: "Other", operation: { node: null } },
      ],
    };
    const r = buildResource(raw);
    expect(r.associatedOps).toHaveLength(1);
    expect(r.associatedOps[0].name).toBe("crossOp");
  });

  it("handles missing operations gracefully", () => {
    const raw = { ...baseRaw, operations: undefined };
    const r = buildResource(raw);
    expect(r.lifecycleOps).toEqual([]);
    expect(r.listOps).toEqual([]);
    expect(r.actionOps).toEqual([]);
    expect(r.associatedOps).toEqual([]);
  });

  it("handles lifecycle values that are plain objects (not arrays)", () => {
    const raw = {
      ...baseRaw,
      operations: {
        lifecycle: {
          read: { name: "get", kind: "read", path: "/vm", operationGroup: "VMs", operation: { node: null } },
        },
        lists: [],
        actions: [],
      },
    };
    const r = buildResource(raw);
    expect(r.lifecycleOps).toHaveLength(1);
    expect(r.lifecycleOps[0].name).toBe("get");
  });
});

// ---------------------------------------------------------------------------
// findEntryPoint
// ---------------------------------------------------------------------------

describe("findEntryPoint", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsp-test-"));
  });

  it("returns undefined when directory is empty", () => {
    expect(findEntryPoint(tmpDir)).toBeUndefined();
  });

  it("returns undefined when only main.tsp exists (no tspconfig.yaml)", () => {
    fs.writeFileSync(path.join(tmpDir, "main.tsp"), "");
    expect(findEntryPoint(tmpDir)).toBeUndefined();
  });

  it("returns undefined when only tspconfig.yaml exists (no main.tsp)", () => {
    fs.writeFileSync(path.join(tmpDir, "tspconfig.yaml"), "");
    expect(findEntryPoint(tmpDir)).toBeUndefined();
  });

  it("returns main.tsp when both main.tsp and tspconfig.yaml are present", () => {
    const p = path.join(tmpDir, "main.tsp");
    fs.writeFileSync(p, "");
    fs.writeFileSync(path.join(tmpDir, "tspconfig.yaml"), "");
    expect(findEntryPoint(tmpDir)).toBe(p);
  });

  it("uses custom main from tspconfig.yaml when both files are present", () => {
    const custom = path.join(tmpDir, "sub", "main.tsp");
    fs.mkdirSync(path.join(tmpDir, "sub"), { recursive: true });
    fs.writeFileSync(custom, "");
    fs.writeFileSync(path.join(tmpDir, "main.tsp"), "");
    fs.writeFileSync(path.join(tmpDir, "tspconfig.yaml"), `main: sub/main.tsp\n`);
    expect(findEntryPoint(tmpDir)).toBe(custom);
  });
});
