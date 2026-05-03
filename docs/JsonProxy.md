# JsonProxy

This document explains what `JsonProxy` does, how to use its public API, and how the internals work.

## Why it exists

`JsonProxy` is a state container designed for incremental backend-to-frontend synchronization.

Instead of sending full JSON payloads after each change, it tracks per-node versions and can emit compact JSON fragments (diffs). The receiver can apply those diffs to stay in sync.

Main goals:

- Keep a mutable object-like API for backend code (`root.a = 1`, `delete root.a`, array operations, nested objects).
- Track what changed with serial counters.
- Produce compact diffs against a snapshot.
- Support filtered sync with a whitelist.
- Trigger callbacks on selected paths (including wildcards).

## Key concepts

- `serial`: version of a specific node/property assignment.
- `childSerial`: latest version seen anywhere under an object/array node.
- `snapshot`: a serial tree used as a synchronization cursor.
- `diff`: compact structure to turn a previous JSON value into the current one.
- `synchronizer`: path-based callback triggered when relevant serials change.

## Public API

The class is generic: `JsonProxy<CONTENTTYPE>`.

### Constructor

- `new JsonProxy<CONTENTTYPE>()`
  Creates an empty root object and initializes versioning at serial `0`.

### Access the mutable target

- `getTarget(): CONTENTTYPE`
  Returns the proxied root object you mutate directly.

Example:

```ts
const tracker = new JsonProxy<any>();
const root = tracker.getTarget();

root.device = { connected: false };
root.device.connected = true;
delete root.device;
```

### Serial snapshot

- `takeSerialSnapshot(whiteList?: WhiteList): ComposedSerialSnapshot`
  Returns the current serial tree (optionally filtered).

Use this as a cursor representing "what the remote already knows".

### Fork initial payload + snapshot

- `fork(whiteList?: WhiteList): { data: CONTENTTYPE, serial: ComposedSerialSnapshot }`
  Returns:
  - `data`: deep-cloned current state (optionally filtered)
  - `serial`: matching snapshot cursor

Typical replication starts with `fork()`.

### Generate incremental changes

- `diff(version: ComposedSerialSnapshot, whiteList?: WhiteList): Diff | undefined`
  Computes changes since `version`, and mutates `version` forward to current state when changes are found.

Returns `undefined` when no relevant change exists.

### Apply diffs on receiver side

- `static applyDiff(from: any, diff: Diff): any`
  Applies one diff and returns a shallow-copied updated value (unmodified branches are shared).

- `static asDiff(value: any): Diff`
  Converts a plain JSON value into a diff-shaped replacement.

### Listener API (global change notifications)

- `addListener(listener: () => void): string`
- `removeListener(listenerId: string): void`

These listeners are called on next tick when at least one change occurred.

### Path synchronizer API (selective notifications)

- `addSynchronizer(path, callback, forceInitialTrigger, locateWildcards?)`
- `addTypedSynchronizer(path: WildcardAccessPath<...>, callback, forceInitialTrigger, locateWildcards?)`
- `removeSynchronizer(trigger): void`
- `flushSynchronizers(): void`

Synchronizers are for fine-grained subscriptions. They allows to maintain internal coherency in the target document, for exemple by ensuring that a pointer item always has a valid target in the document.

## Path syntax for synchronizers

The `path` argument supports several forms:

- Named step: `'device'`
- Wildcard step: `null` (matches any property at that depth)
- Multi-path step: array of paths, like `[ ['a'], ['b'] ]`

Examples:

```ts
['indiManager', 'deviceTree', 'CCD1']
```

```ts
['devices', null, 'connected'] // all devices[*].connected
```

```ts
['plop', null, [['a'], ['b']]] // plop[*].a or plop[*].b
```

When `locateWildcards` is `true`, callback receives a `TriggeredWildcard` tree describing wildcard branches that changed. Non-wildcard direct matches are marked with the `NoWildcard` symbol.

## Diff format

`Diff` is one of:

- Primitive replacement: `number | string | boolean | null`
- `{ newObject: { [key]: Diff } }`
- `{ newArray: { [index]: Diff } }`
- `{ update: { [key]: Diff }, delete?: string[] }`

### Meaning

- `newObject` / `newArray`: replace entire node with a new container.
- `update`: patch selected properties.
- `delete`: remove object keys or truncate arrays from the lowest deleted index.

## Whitelist filtering

`WhiteList` controls visible branches during `fork`, `takeSerialSnapshot`, and `diff`.

Type:

```ts
type WhiteList = undefined | {
  [id: string]: boolean | WhiteList
};
```

Rules:

- `true`: include full subtree.
- nested object: include only declared child keys.
- missing key or `false`: excluded.

Excluded branches do not contribute to emitted diffs for that call.

## Internal mechanisms

### 1) Data model: wrapped nodes

Internally each JSON property is represented by a node:

- `value`: primitive or map/array of child nodes
- `serial`: version of this node
- `childSerial`: max version in subtree (objects/arrays)
- `parent`: parent node pointer
- `proxy`: lazily exposed JS proxy for object/array nodes

Root is always an object node.

### 2) Mutation tracking through `Proxy`

For object/array nodes, `toObjectNode` installs a JS `Proxy`.

- `get`: unwraps stored child node into user-facing value/proxy.
- `set`:
  - rejects `undefined` (not JSON-safe)
  - creates nodes for new keys
  - merges recursively for object/array assignments
  - avoids serial bump on primitive no-op assignments
- `deleteProperty`: removes child and marks old node dirty

### 3) Serial allocation and batching

- `currentSerial` is incremented lazily.
- A serial value is considered "used" once a mutation touches it.
- Notification is batched with `process.nextTick` (`notifyAll`).

`markDirty` sets node `serial` and propagates `childSerial` to ancestors until already up to date.

### 4) Snapshot and diff algorithm

`takeSerialSnapshot` traverses tracked nodes and records serial tree.

`diff(version)` compares live tree with `version`:

- if object/array `serial` changed: emit full replacement (`newObject`/`newArray`), reset version subtree
- else if only `childSerial` changed: emit incremental `update`/`delete`
- for primitives: compare stored serial number and emit new value only when changed

The function mutates `version` in place to the post-diff state.

### 5) Synchronizer engine (`SynchronizerTrigger`)

Synchronizers are stored as a tree parallel to data paths.

Each trigger node maintains:

- child trigger nodes by property
- terminal listeners
- wildcard templates and instantiated wildcard branches
- minimal observed serials (`minSerial`, `minChildSerial`) to skip unchanged branches quickly

Flow:

1. `addSynchronizer` registers path (including wildcard templates).
2. `findReadyCallbacks` walks trigger tree and data tree together.
3. Changed branches enqueue callbacks once (`pending` flag collapses multiple writes).
4. `flushSynchronizers` executes queue and repeats until stable (callbacks may mutate state).
5. `removeSynchronizer` removes path/listener and wildcard-instantiated descendants.

## End-to-end replication pattern

Sender:

```ts
const tx = new JsonProxy<any>();
const root = tx.getTarget();

const { data, serial } = tx.fork();
sendInitial(data, serial);

function onStateChange() {
  const patch = tx.diff(serial);
  if (patch !== undefined) {
    sendPatch(patch);
  }
}

tx.addListener(onStateChange);
```

Receiver:

```ts
let state: any = initialData;

function onPatch(diff: any) {
  state = JsonProxy.applyDiff(state, diff);
}
```

## Behavior guarantees and caveats

- `undefined` assignments are rejected.
- Primitive no-op assignment keeps serial unchanged.
- Array/object replacement may emit full `newArray`/`newObject` depending on serial transition.
- Multiple changes in one tick trigger synchronizers once per callback execution cycle.
- `diff` updates the provided version object; callers should treat it as mutable state.

## Related source files

- `shared/JsonProxy.ts`
- `JsonProxy.test.ts`
- `JsonProxySynchronizers.test.ts`
- `shared/AccessPath.ts`