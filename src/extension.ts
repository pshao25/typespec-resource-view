import * as vscode from "vscode";
import * as fs from "fs";
import { ResourceTreeProvider } from "./tree/resourceTreeProvider";
import { OperationTreeProvider } from "./tree/operationTreeProvider";
import { parseTypeSpecProject } from "./parser/typespecParser";
import { TspFileWatcher } from "./watcher/fileWatcher";

let watcher: TspFileWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("[TypeSpec Graph] Extension activated.");

  const resourceProvider  = new ResourceTreeProvider();
  const operationProvider = new OperationTreeProvider();

  // Resources view (top)
  const resourceView = vscode.window.createTreeView(
    "typespecResourceGraph.resources",
    {
      treeDataProvider: resourceProvider,
      showCollapseAll: true,
    }
  );

  // Operations view (bottom) — updated when user selects a resource
  const operationView = vscode.window.createTreeView(
    "typespecResourceGraph.operations",
    {
      treeDataProvider: operationProvider,
    }
  );

  context.subscriptions.push(resourceView, operationView);

  // When the user selects a resource node, populate the operations view
  context.subscriptions.push(
    resourceView.onDidChangeSelection((e) => {
      const selected = e.selection[0];
      if (selected?.kind === "resource") {
        operationProvider.showResource(selected.data);
        // Update the operations view title to reflect the selected resource
        operationView.title = `Operations — ${selected.data.name}`;
      } else {
        operationProvider.clear();
        operationView.title = "Operations";
      }
    })
  );

  // Navigate-to-source command (used by both trees)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "typespecGraph.navigateTo",
      async (file: string, line: number, char: number) => {
        if (!file || !fs.existsSync(file)) {
          vscode.window.showWarningMessage(`Source file not found: ${file}`);
          return;
        }
        const uri = vscode.Uri.file(file);
        const pos = new vscode.Position(line, char);
        await vscode.window.showTextDocument(uri, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(pos, pos),
          preserveFocus: false,
        });
      }
    )
  );

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("typespecGraph.refresh", () => {
      runParse(resourceProvider, operationProvider);
    })
  );

  // Show command — focus the view and (re)parse
  context.subscriptions.push(
    vscode.commands.registerCommand("typespecGraph.show", () => {
      vscode.commands.executeCommand("typespecResourceGraph.resources.focus");
      runParse(resourceProvider, operationProvider);
    })
  );

  // Auto-parse on activation
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    setTimeout(() => {
      runParse(resourceProvider, operationProvider);

      watcher = new TspFileWatcher(async () => {
        await runParse(resourceProvider, operationProvider);
      });
      context.subscriptions.push({ dispose: () => watcher?.dispose() });
    }, 800);
  }
}

export function deactivate() {
  watcher?.dispose();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runParse(
  resourceProvider: ResourceTreeProvider,
  operationProvider: OperationTreeProvider
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    resourceProvider.setError(
      "No workspace folder found.\nPlease open a TypeSpec project folder."
    );
    return;
  }

  resourceProvider.setLoading();
  operationProvider.clear();

  try {
    const data = await parseTypeSpecProject(workspaceRoot);

    if (data.length === 0) {
      resourceProvider.setEmpty(
        "No ARM resources found.\n" +
          "Make sure your .tsp files use @armProviderNamespace and define resources."
      );
      return;
    }

    resourceProvider.setData(data);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    // "No TypeSpec entry point found" is an expected condition — show as empty state
    if (msg.includes("No TypeSpec entry point")) {
      resourceProvider.setEmpty(
        "No TypeSpec entry point found.\n" +
          "Open a folder that contains a .tsp file (or tspconfig.yaml)."
      );
      return;
    }
    console.error("[TypeSpec Graph] Parse error:", err);
    resourceProvider.setError(`Failed to parse TypeSpec project:\n\n${msg}`);
  }
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
