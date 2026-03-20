import * as vscode from "vscode";
import * as fs from "fs";
import { ResourceTreeProvider } from "./tree/resourceTreeProvider";
import { OperationTreeProvider } from "./tree/operationTreeProvider";
import { ProviderOperationTreeProvider } from "./tree/providerOperationTreeProvider";
import { parseTypeSpecProject } from "./parser/typespecParser";
import { TspFileWatcher } from "./watcher/fileWatcher";

let watcher: TspFileWatcher | undefined;

/** The folder currently being parsed and watched. */
let activeRoot: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("[TypeSpec Graph] Extension activated.");

  const resourceProvider  = new ResourceTreeProvider();
  const operationProvider = new OperationTreeProvider();
  const providerOpProvider = new ProviderOperationTreeProvider();

  // Resources view (top)
  const resourceView = vscode.window.createTreeView(
    "typespecResourceGraph.resources",
    {
      treeDataProvider: resourceProvider,
      showCollapseAll: true,
    }
  );

  // Operations view (middle) — updated when user selects a resource
  const operationView = vscode.window.createTreeView(
    "typespecResourceGraph.operations",
    {
      treeDataProvider: operationProvider,
    }
  );

  // Provider Operations view (bottom)
  const providerOpView = vscode.window.createTreeView(
    "typespecResourceGraph.providerOperations",
    {
      treeDataProvider: providerOpProvider,
    }
  );

  context.subscriptions.push(resourceView, operationView, providerOpView);

  // When the user selects a resource node, populate the operations view
  context.subscriptions.push(
    resourceView.onDidChangeSelection((e) => {
      const selected = e.selection[0];
      if (selected?.kind === "resource") {
        operationProvider.showResource(selected.data);
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

  // Refresh command — re-parses the currently active root
  context.subscriptions.push(
    vscode.commands.registerCommand("typespecGraph.refresh", () => {
      const root = activeRoot ?? getWorkspaceRoot();
      if (root) {
        switchRoot(root, resourceProvider, operationProvider, providerOpProvider, resourceView);
      }
    })
  );

  // Show command — focus the view and (re)parse the workspace root
  context.subscriptions.push(
    vscode.commands.registerCommand("typespecGraph.show", () => {
      vscode.commands.executeCommand("typespecResourceGraph.resources.focus");
      const root = activeRoot ?? getWorkspaceRoot();
      if (root) {
        switchRoot(root, resourceProvider, operationProvider, providerOpProvider, resourceView);
      }
    })
  );

  // Context-menu command — right-click a folder in Explorer
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "typespecGraph.showForFolder",
      (folderUri: vscode.Uri) => {
        const folderPath = folderUri.fsPath;
        // Focus the panel first so the user sees the tree update
        vscode.commands.executeCommand("typespecResourceGraph.resources.focus");
        switchRoot(folderPath, resourceProvider, operationProvider, providerOpProvider, resourceView);
      }
    )
  );

  // Auto-parse on activation using the workspace root
  const initialRoot = getWorkspaceRoot();
  if (initialRoot) {
    activeRoot = initialRoot;
    setTimeout(() => {
      switchRoot(initialRoot, resourceProvider, operationProvider, providerOpProvider, resourceView);
    }, 800);
  }
}

export function deactivate() {
  watcher?.dispose();
}

// ---------------------------------------------------------------------------
// Switch the active root: tear down old watcher, parse, start new watcher
// ---------------------------------------------------------------------------

function switchRoot(
  root: string,
  resourceProvider: ResourceTreeProvider,
  operationProvider: OperationTreeProvider,
  providerOpProvider: ProviderOperationTreeProvider,
  resourceView: vscode.TreeView<any>
): void {
  // Tear down previous watcher
  watcher?.dispose();
  watcher = undefined;

  activeRoot = root;

  // Update the Resources panel title to show which folder is active
  const folderName = root.replace(/\\/g, "/").split("/").pop() ?? root;
  resourceView.title = `Resources — ${folderName}`;

  // Parse
  runParse(root, resourceProvider, operationProvider, providerOpProvider);

  // Start a new file watcher for the new root
  watcher = new TspFileWatcher(async () => {
    await runParse(root, resourceProvider, operationProvider, providerOpProvider);
  });
}

// ---------------------------------------------------------------------------
// Parse a specific root folder
// ---------------------------------------------------------------------------

async function runParse(
  workspaceRoot: string,
  resourceProvider: ResourceTreeProvider,
  operationProvider: OperationTreeProvider,
  providerOpProvider: ProviderOperationTreeProvider
): Promise<void> {
  resourceProvider.setLoading();
  operationProvider.clear();
  providerOpProvider.setLoading();

  try {
    const { providers, providerOperations } = await parseTypeSpecProject(workspaceRoot);

    if (providers.length === 0 && providerOperations.length === 0) {
      resourceProvider.setEmpty(
        "No ARM resources found.\n" +
          "Make sure your .tsp files use @armProviderNamespace and define resources."
      );
      providerOpProvider.setOps([]);
      return;
    }

    resourceProvider.setData(providers);
    providerOpProvider.setOps(providerOperations);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No TypeSpec entry point")) {
      resourceProvider.setEmpty(
        "No TypeSpec entry point found.\n" +
          "Open a folder that contains a .tsp file (or tspconfig.yaml)."
      );
      providerOpProvider.setOps([]);
      return;
    }
    console.error("[TypeSpec Graph] Parse error:", err);
    resourceProvider.setError(`Failed to parse TypeSpec project:\n\n${msg}`);
    providerOpProvider.setOps([]);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
