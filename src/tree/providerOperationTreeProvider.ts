import * as vscode from "vscode";
import { ArmOperation } from "../shared/types";

// ---------------------------------------------------------------------------
// Tree item types — provider-level operations only
// ---------------------------------------------------------------------------

export type ProviderOperationItem =
  | { kind: "loading" }
  | { kind: "placeholder"; message: string }
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
// ProviderOperationTreeProvider
// ---------------------------------------------------------------------------

export class ProviderOperationTreeProvider
  implements vscode.TreeDataProvider<ProviderOperationItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<ProviderOperationItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _state:
    | { status: "loading" }
    | { status: "ready"; ops: ArmOperation[] }
    = { status: "loading" };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setLoading() {
    this._state = { status: "loading" };
    this._onDidChangeTreeData.fire();
  }

  /**
   * Receives the flat providerOperations array directly from the Provider
   * returned by resolveArmResources (via the parser).
   */
  setOps(ops: ArmOperation[]) {
    this._state = { status: "ready", ops };
    this._onDidChangeTreeData.fire();
  }

  // -------------------------------------------------------------------------
  // TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: ProviderOperationItem): vscode.TreeItem {
    switch (element.kind) {
      case "loading": {
        const item = new vscode.TreeItem("Loading…");
        item.iconPath = new vscode.ThemeIcon("loading~spin");
        return item;
      }
      case "placeholder": {
        const item = new vscode.TreeItem(element.message);
        item.iconPath = new vscode.ThemeIcon("info");
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
        item.contextValue = "providerOperation";
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

  getChildren(element?: ProviderOperationItem): vscode.ProviderResult<ProviderOperationItem[]> {
    // Operations are leaf nodes — they have no children
    if (element) return [];

    if (this._state.status === "loading") {
      return [{ kind: "loading" }];
    }

    if (this._state.ops.length === 0) {
      return [{ kind: "placeholder", message: "No provider-level operations found." }];
    }

    return this._state.ops.map((op): ProviderOperationItem => ({
      kind: "operation",
      data: op,
    }));
  }
}
