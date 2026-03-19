import * as path from "path";
import * as fs from "fs";
import {
  ProviderData,
  ArmResource,
  ArmOperation,
  ArmResourceKind,
  ArmOperationKind,
  SourceLocation,
} from "../shared/types";

// ---------------------------------------------------------------------------
// Package discovery
// ---------------------------------------------------------------------------

function findPackageInAncestors(startDir: string, ...pkgParts: string[]): string | undefined {
  let current = path.normalize(startDir);
  while (true) {
    const candidate = path.join(current, "node_modules", ...pkgParts);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function resolvePackageEntry(packageDir: string): string {
  const pkgJsonPath = path.join(packageDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.exports) {
        const root = pkg.exports["."];
        if (root) {
          const entry =
            typeof root === "string"
              ? root
              : root.import ?? root.default ?? root.require;
          if (entry) return path.join(packageDir, entry);
        }
        if (typeof pkg.exports === "string") return path.join(packageDir, pkg.exports);
      }
      const entry = pkg.module ?? pkg.main;
      if (entry) return path.join(packageDir, entry);
    } catch { /* fall through */ }
  }
  const fallback = path.join(packageDir, "dist", "src", "index.js");
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`Cannot resolve ESM entry point for package at: ${packageDir}`);
}

function pathToFileUrl(absPath: string): string {
  const normalised = absPath.replace(/\\/g, "/");
  return normalised.startsWith("/") ? `file://${normalised}` : `file:///${normalised}`;
}

async function dynamicImport(packageDir: string): Promise<any> {
  const entryFile = resolvePackageEntry(packageDir);
  const url = pathToFileUrl(entryFile);
  // eslint-disable-next-line no-new-func
  const doImport = new Function("u", "return import(u)");
  return doImport(url);
}

// ---------------------------------------------------------------------------
// Entry point discovery
// ---------------------------------------------------------------------------

function findEntryPoint(workspaceRoot: string): string | undefined {
  const tspConfigPath = path.join(workspaceRoot, "tspconfig.yaml");
  if (fs.existsSync(tspConfigPath)) {
    const content = fs.readFileSync(tspConfigPath, "utf-8");
    const m = content.match(/^\s*main\s*:\s*["']?([^\s"']+\.tsp)["']?/m);
    if (m) return path.join(workspaceRoot, m[1]);
  }
  for (const c of ["main.tsp", "client.tsp", "service.tsp"]) {
    const p = path.join(workspaceRoot, c);
    if (fs.existsSync(p)) return p;
  }
  const files = fs.readdirSync(workspaceRoot);
  const f = files.find((f) => f.endsWith(".tsp"));
  if (f) return path.join(workspaceRoot, f);
  return undefined;
}

// ---------------------------------------------------------------------------
// Source location
// ---------------------------------------------------------------------------

/**
 * Walk up the AST parent chain to find the SourceFile node,
 * which has a .file object with getLineAndCharacterOfPosition().
 */
function findSourceFileNode(node: any, depth = 0): any {
  if (!node || depth > 30) return undefined;
  if (node.file && typeof node.file.getLineAndCharacterOfPosition === "function") return node;
  return findSourceFileNode(node.parent, depth + 1);
}

function getSourceLocation(node: any): SourceLocation {
  if (!node) return { file: "", line: 0, char: 0 };
  try {
    const sfNode = findSourceFileNode(node);
    if (!sfNode) return { file: "", line: 0, char: 0 };
    const filePath: string = sfNode.file.path ?? "";
    const pos: number = node.pos ?? 0;
    const lc = sfNode.file.getLineAndCharacterOfPosition(pos) as { line: number; character: number };
    return { file: filePath, line: lc.line, char: lc.character };
  } catch {
    return { file: "", line: 0, char: 0 };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ParseResult {
  providers: ProviderData[];
  providerOperations: ArmOperation[];
}

export async function parseTypeSpecProject(
  workspaceRoot: string
): Promise<ParseResult> {
  // Load @typespec/compiler
  const compilerPkgDir = findPackageInAncestors(workspaceRoot, "@typespec", "compiler");
  if (!compilerPkgDir) {
    throw new Error(
      `@typespec/compiler not found.\nSearched from: ${workspaceRoot}\nPlease run 'npm install'.`
    );
  }
  const compiler = await dynamicImport(compilerPkgDir);

  // Load @azure-tools/typespec-azure-resource-manager
  const armPkgDir = findPackageInAncestors(
    workspaceRoot,
    "@azure-tools",
    "typespec-azure-resource-manager"
  );
  if (!armPkgDir) {
    throw new Error(
      `@azure-tools/typespec-azure-resource-manager not found.\nSearched from: ${workspaceRoot}\nPlease run 'npm install'.`
    );
  }
  const arm = await dynamicImport(armPkgDir);

  // Find entry point
  const entryPoint = findEntryPoint(workspaceRoot);
  if (!entryPoint) {
    throw new Error(
      `No TypeSpec entry point (.tsp file) found in workspace: ${workspaceRoot}`
    );
  }

  // Compile
  const NodeHost = compiler.NodeHost;
  const entryPointDir = path.dirname(entryPoint);
  const [options] = await compiler.resolveCompilerOptions(NodeHost, {
    entrypoint: entryPoint,
    cwd: entryPointDir,
  });
  const program = await compiler.compile(NodeHost, entryPoint, {
    ...options,
    noEmit: true,
  });

  // Resolve ARM resources
  const provider: { resources?: any[]; providerOperations?: any[] } =
    arm.resolveArmResources(program);

  const providerOperations = (provider.providerOperations ?? []).map(buildOperation);
  const providers = buildProviderData(provider);
  return { providers, providerOperations };
}

// ---------------------------------------------------------------------------
// Map raw ARM data → ProviderData[]
// ---------------------------------------------------------------------------

function buildProviderData(
  raw: { resources?: any[]; providerOperations?: any[] }
): ProviderData[] {
  const rawResources = raw.resources ?? [];

  if (rawResources.length === 0) return [];

  // Group by provider namespace
  const byNamespace = new Map<string, any[]>();

  for (const r of rawResources) {
    const ns: string = r.providerNamespace ?? "(unknown)";
    if (!byNamespace.has(ns)) byNamespace.set(ns, []);
    byNamespace.get(ns)!.push(r);
  }

  const result: ProviderData[] = [];
  for (const [ns, resources] of byNamespace) {
    // Build a flat id→ArmResource map first, then wire parent–child
    const idMap = new Map<string, ArmResource>();
    const allBuilt: { armRes: ArmResource; raw: any }[] = [];

    for (const r of resources) {
      const armRes = buildResource(r);
      const id = r.resourceInstancePath ?? armRes.name;
      idMap.set(id, armRes);
      allBuilt.push({ armRes, raw: r });
    }

    // Wire parent–child relationships
    const topLevel: ArmResource[] = [];
    for (const { armRes, raw } of allBuilt) {
      if (raw.parent) {
        const parentId = raw.parent.resourceInstancePath ?? raw.parent.type?.name;
        const parentRes = parentId ? idMap.get(parentId) : undefined;
        if (parentRes) {
          parentRes.children.push(armRes);
          continue;
        }
      }
      topLevel.push(armRes);
    }

    result.push({ namespace: ns, resources: topLevel });
  }

  return result;
}

function buildResource(r: any): ArmResource {
  const { provider, types } = r.resourceType ?? {};
  const resourceType =
    provider && types ? `${provider}/${types.join("/")}` : r.type?.name ?? "";

  // Lifecycle operations
  const lifecycleOps: ArmOperation[] = [];
  const lifecycle = r.operations?.lifecycle ?? {};
  for (const [, opOrList] of Object.entries(lifecycle)) {
    const ops = Array.isArray(opOrList) ? opOrList : opOrList ? [opOrList] : [];
    for (const op of ops as any[]) {
      lifecycleOps.push(buildOperation(op));
    }
  }

  // List + action operations
  const listOps: ArmOperation[] = (r.operations?.lists ?? []).map(buildOperation);
  const actionOps: ArmOperation[] = (r.operations?.actions ?? []).map(buildOperation);

  // Associated operations (cross-resource operations referencing this resource)
  const associatedOps: ArmOperation[] = (r.associatedOperations ?? []).map(buildOperation);

  return {
    name: r.resourceName ?? r.type?.name ?? resourceType,
    kind: normalizeKind(r.kind),
    providerNamespace: r.providerNamespace ?? "",
    resourceType,
    resourceInstancePath: r.resourceInstancePath ?? "",
    children: [], // wired later
    lifecycleOps,
    listOps,
    actionOps,
    associatedOps,
    location: getSourceLocation(r.type?.node),
  };
}

function buildOperation(op: any): ArmOperation {
  return {
    name: op.name ?? op.operation?.name ?? "unknown",
    kind: normalizeOpKind(op.kind),
    path: op.path ?? op.httpOperation?.path ?? "",
    operationGroup: op.operationGroup ?? "",
    location: getSourceLocation(op.operation?.node),
  };
}

function normalizeKind(kind: string | undefined): ArmResourceKind {
  const valid: ArmResourceKind[] = [
    "Tracked", "Proxy", "Extension", "Virtual", "Custom", "BuiltIn", "Other",
  ];
  if (kind && valid.includes(kind as ArmResourceKind)) return kind as ArmResourceKind;
  return "Other";
}

function normalizeOpKind(kind: string | undefined): ArmOperationKind {
  const valid: ArmOperationKind[] = [
    "read", "createOrUpdate", "update", "delete", "checkExistence",
    "list", "action", "other",
  ];
  if (kind && valid.includes(kind as ArmOperationKind)) return kind as ArmOperationKind;
  return "other";
}
