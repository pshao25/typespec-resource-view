import * as vscode from "vscode";
import { ProviderData, ArmResource, ArmResourceKind } from "../shared/types";

// ---------------------------------------------------------------------------
// Tree item types — resources only
// ---------------------------------------------------------------------------

export type ResourceItem =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "provider"; data: ProviderData }
  | { kind: "resource"; data: ArmResource; parent: ResourceItem };

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const KIND_ICON: Record<ArmResourceKind, string> = {
  Tracked:   "symbol-class",
  Proxy:     "symbol-interface",
  Extension: "extensions",
  Virtual:   "symbol-misc",
  Custom:    "symbol-struct",
  BuiltIn:   "symbol-namespace",
  Other:     "circle-outline",
};

// ---------------------------------------------------------------------------
// ResourceTreeProvider
// ---------------------------------------------------------------------------

export class ResourceTreeProvider
  implements vscode.TreeDataProvider<ResourceItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<ResourceItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _state:
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "empty"; message: string }
    | { status: "ready"; data: ProviderData[] }
    = { status: "loading" };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setLoading() {
    this._state = { status: "loading" };
    this._onDidChangeTreeData.fire();
  }

  setError(message: string) {
    this._state = { status: "error", message };
    this._onDidChangeTreeData.fire();
  }

  setEmpty(message: string) {
    this._state = { status: "empty", message };
    this._onDidChangeTreeData.fire();
  }

  setData(providers: ProviderData[]) {
    this._state = { status: "ready", data: providers };
    this._onDidChangeTreeData.fire();
  }

  // -------------------------------------------------------------------------
  // TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: ResourceItem): vscode.TreeItem {
    switch (element.kind) {
      case "loading": {
        const item = new vscode.TreeItem("Loading…");
        item.iconPath = new vscode.ThemeIcon("loading~spin");
        return item;
      }
      case "error": {
        const item = new vscode.TreeItem("Error");
        item.description = element.message;
        item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
        item.tooltip = element.message;
        return item;
      }
      case "empty": {
        const item = new vscode.TreeItem(element.message.split("\n")[0]);
        item.description = element.message.split("\n").slice(1).join(" ");
        item.iconPath = new vscode.ThemeIcon("info");
        item.tooltip = element.message;
        return item;
      }
      case "provider": {
        const { data } = element;
        const total = countResources(data.resources);
        const item = new vscode.TreeItem(data.namespace, vscode.TreeItemCollapsibleState.Expanded);
        item.description = `${total} resource${total !== 1 ? "s" : ""}`;
        item.iconPath = new vscode.ThemeIcon("symbol-namespace");
        item.tooltip = data.namespace;
        item.contextValue = "provider";
        return item;
      }
      case "resource": {
        const { data } = element;
        const collapsible = data.children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(data.name, collapsible);
        item.description = data.kind;
        item.tooltip = new vscode.MarkdownString(
          `**${data.name}** *(${data.kind})*\n\n` +
          `Type: \`${data.resourceType}\`\n\n` +
          `Path: \`${data.resourceInstancePath}\``
        );
        item.iconPath = new vscode.ThemeIcon(KIND_ICON[data.kind]);
        item.contextValue = "resource";
        // Click → navigate to source
        if (data.location.file) {
          item.command = {
            command: "typespecGraph.navigateTo",
            title: "Go to Source",
            arguments: [data.location.file, data.location.line, data.location.char],
          };
        }
        return item;
      }
    }
  }

  getChildren(element?: ResourceItem): vscode.ProviderResult<ResourceItem[]> {
    if (!element) {
      if (this._state.status === "loading") return [{ kind: "loading" }];
      if (this._state.status === "error")   return [{ kind: "error", message: this._state.message }];
      if (this._state.status === "empty")   return [{ kind: "empty", message: this._state.message }];
      const providers = this._state.data;
      if (providers.length === 0) return [{ kind: "empty", message: "No ARM resources found." }];
      return providers.map((p): ResourceItem => ({ kind: "provider", data: p }));
    }

    if (element.kind === "provider") {
      return element.data.resources.map((r): ResourceItem => ({
        kind: "resource",
        data: r,
        parent: element,
      }));
    }

    if (element.kind === "resource") {
      return element.data.children.map((r): ResourceItem => ({
        kind: "resource",
        data: r,
        parent: element,
      }));
    }

    return [];
  }

  // Needed for TreeView.reveal() to work correctly
  getParent(element: ResourceItem): ResourceItem | undefined {
    if (element.kind === "resource") return element.parent;
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countResources(resources: ArmResource[]): number {
  return resources.reduce((acc, r) => acc + 1 + countResources(r.children), 0);
}
