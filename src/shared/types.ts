// Shared data types (Extension Host only — no webview)

export type ArmResourceKind =
  | "Tracked"
  | "Proxy"
  | "Extension"
  | "Virtual"
  | "Custom"
  | "BuiltIn"
  | "Other";

export type ArmOperationKind =
  | "read"
  | "createOrUpdate"
  | "update"
  | "delete"
  | "checkExistence"
  | "list"
  | "action"
  | "other";

export interface SourceLocation {
  file: string;
  line: number;
  char: number;
}

export interface ArmOperation {
  name: string;
  kind: ArmOperationKind;
  path: string;
  operationGroup: string;
  location: SourceLocation;
}

export interface ArmResource {
  /** Display name, e.g. "VirtualMachine" */
  name: string;
  /** ARM resource kind */
  kind: ArmResourceKind;
  /** Provider namespace, e.g. "Microsoft.Compute" */
  providerNamespace: string;
  /** Full resource type string, e.g. "Microsoft.Compute/virtualMachines" */
  resourceType: string;
  /** ARM REST path template */
  resourceInstancePath: string;
  /** Child resources */
  children: ArmResource[];
  /** Lifecycle operations (read, createOrUpdate, update, delete, checkExistence) */
  lifecycleOps: ArmOperation[];
  /** List operations */
  listOps: ArmOperation[];
  /** Action operations */
  actionOps: ArmOperation[];
  /** Source location of the TypeSpec model */
  location: SourceLocation;
}

export interface ProviderData {
  /** Provider namespace */
  namespace: string;
  /** Top-level resources (no parent) */
  resources: ArmResource[];
  /** Operations not attached to any resource */
  providerOps: ArmOperation[];
}
