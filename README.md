# TypeSpec Resource Graph

A VS Code extension that parses Azure ARM TypeSpec projects and displays resources and operations in a native TreeView panel.

## Features

- **Resources view** — displays the ARM resource hierarchy grouped by provider namespace. Each resource node shows its kind (`Tracked`, `Proxy`, `Extension`, etc.) and hovering reveals the full resource type and path.
- **Operations view** — shows operations for the selected resource, grouped into **Lifecycle**, **List**, **Actions**, and **Associated** categories. The panel title updates to reflect the selected resource.
- **Provider Operations view** — flat list of provider-level operations returned by `resolveArmResources`.
- **Click to source** — clicking any resource or operation node jumps to the corresponding `.tsp` file at the exact line.
- **Auto-refresh** — a file watcher monitors `.tsp` files and re-parses automatically with a 500 ms debounce after any change.
- **Right-click a folder** — right-click any folder in the Explorer and choose **Show TypeSpec ARM Resources** to parse that specific project. The active folder and watcher switch to the selected directory.

## Requirements

The workspace being parsed must have the following packages installed (the extension loads them dynamically from the project's `node_modules`):

- [`@typespec/compiler`](https://www.npmjs.com/package/@typespec/compiler)
- [`@azure-tools/typespec-azure-resource-manager`](https://www.npmjs.com/package/@azure-tools/typespec-azure-resource-manager)

The project must contain a TypeSpec entry point — one of:

| Priority | File |
|----------|------|
| 1 | `tspconfig.yaml` with a `main:` field |
| 2 | `main.tsp` |
| 3 | `client.tsp` |
| 4 | Any `.tsp` file in the workspace root |

## Usage

1. Open a TypeSpec project folder in VS Code.
2. The extension activates automatically when a `.tsp` file or `tspconfig.yaml` is detected.
3. Click the **TypeSpec Resources** icon in the Activity Bar to open the panel.
4. Select a resource node to populate the Operations view.
5. Click any resource or operation node to navigate to its source definition.

To parse a specific subfolder, right-click it in the Explorer and select **Show TypeSpec ARM Resources**.

To manually trigger a re-parse, click the **Refresh** button (↺) in the Resources view title bar, or run the command `TypeSpec: Show Resource Tree` from the Command Palette.

## Extension Views

```
Activity Bar — TypeSpec Resources
├── Resources              (provider → resource → child resources)
├── Operations             (Lifecycle / List / Actions / Associated)
└── Provider Operations    (flat provider-level operations)
```

## Commands

| Command | Description |
|---------|-------------|
| `TypeSpec: Show Resource Tree` | Focus the panel and re-parse the current workspace |
| `TypeSpec: Refresh` | Re-parse the currently active root folder |
| `Show TypeSpec ARM Resources` | Right-click a folder → parse that folder |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Type-check
npm run compile

# Run tests
npm test
```

Press **F5** in VS Code to launch the Extension Development Host.

## How It Works

1. The entry point (`.tsp` file) is located first — if none is found the panel shows an empty state immediately without loading any dependencies.
2. `@typespec/compiler` and `@azure-tools/typespec-azure-resource-manager` are loaded dynamically from the target project's `node_modules` using a native ESM `import()`, bypassing the extension's own bundled CommonJS context.
3. The TypeSpec program is compiled in-memory (`noEmit: true`) and `resolveArmResources()` extracts the resource and operation data.
4. The three TreeView providers render the data as VS Code native tree items — no Webview or D3.
