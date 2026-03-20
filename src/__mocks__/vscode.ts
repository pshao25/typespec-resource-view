/**
 * Minimal vscode API mock for unit tests (vitest).
 * Only stubs the surface area used by the tree providers.
 */

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => void> = [];
  readonly event = (listener: (e: T) => void) => {
    this._listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(_event?: T) {
    // no-op in tests — we don't need to observe fires
  }
}

export class ThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: ThemeColor
  ) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  constructor(public readonly value: string) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string | undefined;
  description?: string;
  tooltip?: string | MarkdownString;
  iconPath?: ThemeIcon | string;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: any[] };
  collapsibleState?: TreeItemCollapsibleState;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}
