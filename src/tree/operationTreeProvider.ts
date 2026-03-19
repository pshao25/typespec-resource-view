import * as vscode from "vscode";
import { ArmResource, ArmOperation } from "../shared/types";

// ---------------------------------------------------------------------------
// Tree item types — operations only
// ---------------------------------------------------------------------------

export type OperationItem =
  | { kind: "placeholder"; message: string }
  | { kind: "group"; label: string; ops: ArmOperation[] }
  | { kind: "operation"; data: ArmOperation };

const OP_KIND_ICON: Record<string, string> = {
  read:           "eye",
  createOrUpdate: "add",
  update:         "edit",
  delete:         "trash",
  checkExistence: "question",
  list:           "list-unordered",
  action:         "zap",
  other:          "symbol-event",
};

// ---------------------------------------------------------------------------
// OperationTreeProvider
// ---------------------------------------------------------------------------

export class OperationTreeProvider
  implements vscode.TreeDataProvider<OperationItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<OperationItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _resource: ArmResource | undefined;

  // -------------------------------------------------------------------------
  // Public API — called from extension.ts on selection change
  // -------------------------------------------------------------------------

  showResource(resource: ArmResource) {
    this._resource = resource;
    this._onDidChangeTreeData.fire();
  }

  clear() {
    this._resource = undefined;
    this._onDidChangeTreeData.fire();
  }

  // -------------------------------------------------------------------------
  // TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: OperationItem): vscode.TreeItem {
    switch (element.kind) {
      case "placeholder": {
        const item = new vscode.TreeItem(element.message);
        item.iconPath = new vscode.ThemeIcon("info");
        return item;
      }
      case "group": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = `${element.ops.length}`;
        item.iconPath = new vscode.ThemeIcon("symbol-method");
        return item;
      }
      case "operation": {
        const { data } = element;
        const item = new vscode.TreeItem(data.name, vscode.TreeItemCollapsibleState.None);
        item.description = data.path;
        item.tooltip = new vscode.MarkdownString(
          `**${data.name}** *(${data.kind})*\n\n` +
          `Path: \`${data.path}\`` +
          (data.operationGroup ? `\n\nGroup: \`${data.operationGroup}\`` : "")
        );
        item.iconPath = new vscode.ThemeIcon(OP_KIND_ICON[data.kind] ?? "symbol-event");
        item.contextValue = "operation";
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

  getChildren(element?: OperationItem): vscode.ProviderResult<OperationItem[]> {
    // Root
    if (!element) {
      if (!this._resource) {
        return [{ kind: "placeholder", message: "Select a resource to see its operations" }];
      }
      const r = this._resource;
      const groups: OperationItem[] = [];
      if (r.lifecycleOps.length > 0) {
        groups.push({ kind: "group", label: "Lifecycle", ops: r.lifecycleOps });
      }
      if (r.listOps.length > 0) {
        groups.push({ kind: "group", label: "List", ops: r.listOps });
      }
      if (r.actionOps.length > 0) {
        groups.push({ kind: "group", label: "Actions", ops: r.actionOps });
      }
      if (groups.length === 0) {
        return [{ kind: "placeholder", message: "No operations defined for this resource" }];
      }
      return groups;
    }

    if (element.kind === "group") {
      return element.ops.map((op): OperationItem => ({ kind: "operation", data: op }));
    }

    return [];
  }
}
