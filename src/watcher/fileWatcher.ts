import * as vscode from "vscode";

type ParseCallback = () => Promise<void>;

/**
 * Watches .tsp files in the workspace for changes.
 * Triggers a debounced reparse when any .tsp file is created, changed, or deleted.
 */
export class TspFileWatcher {
  private _watcher: vscode.FileSystemWatcher;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _debounceMs = 500;

  constructor(private readonly _onChanged: ParseCallback) {
    this._watcher = vscode.workspace.createFileSystemWatcher("**/*.tsp");
    this._watcher.onDidChange(() => this._schedule());
    this._watcher.onDidCreate(() => this._schedule());
    this._watcher.onDidDelete(() => this._schedule());
  }

  private _schedule() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._onChanged().catch((err) => {
        console.error("[TypeSpec Graph] Watcher reparse error:", err);
      });
    }, this._debounceMs);
  }

  public dispose() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._watcher.dispose();
  }
}
