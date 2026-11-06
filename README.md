# @lp-labs/operation-journal

Append-only adapter journal with bounded checksummed replay and explicit sequence checkpoints.

Original independent MIT TypeScript implementation with **zero runtime/peer dependencies**. ESM and CommonJS with separate declarations, Node 18+ (browser use when adapters/APIs are available). Development dependencies are not consumer runtime dependencies.

## Install

```sh
npm install @lp-labs/operation-journal
```

## Complete example

```js
import assert from 'node:assert/strict';
import { createOperationJournal, journalChecksum, JournalError } from '@lp-labs/operation-journal';
const entries = [];
const adapter = {
  async append(entry, expected) {
    assert.equal(entries.length, expected);
    entries.push(entry);
  },
  async *read(after) {
    yield* entries.filter((e) => e.sequence > after);
  },
};
const writer = createOperationJournal(adapter);
await writer.append('first');
await writer.append('second');
const reader = createOperationJournal(adapter);
const replay = [];
assert.equal(
  await reader.replay((e) => {
    replay.push(e.payload);
  }),
  2,
);
assert.deepEqual(replay, ['first', 'second']);
assert.equal(journalChecksum(1, 'first'), entries[0].checksum);
```

CommonJS exposes the same API: `const api = require('@lp-labs/operation-journal')`.

## Scope, customization and performance

Adapter must atomically compare previous sequence and append durably. Payload is an opaque string; FNV-1a checksum detects accidental corruption only. Checkpoint is last processed sequence, supplied to recreate journal; compaction is external and must retain all records after checkpoints. No built-in compaction, state snapshots or cryptographic integrity. Defaults replay 10,000 entries, 1 MiB per payload; replay advances checkpoint only after each handler success (earlier effects are not rolled back). Single operation at a time. Handler must be idempotent on persistence/replay failures.

Configure explicit limits, clocks, policies and adapters through the API below. Error classes and standard TypeError/RangeError reject malformed input; adapter/handler errors propagate. Await asynchronous methods and handle rejection in your application; no success-shaped fallback on failed work. Inputs must be trusted ordinary data, not hostile proxies; adapters must meet documented atomicity, isolation and ownership contracts. This package never publishes data, loads external code or starts background services at import time.

## API reference

The complete exported TypeScript contract (including option defaults discussed above, method return shapes, and error codes) is included below. TypeScript users import interfaces using `import type`; JavaScript users pass matching ordinary objects. Signature optionals indicate intentionally optional fields, not silent recovery.

```ts
export interface JournalEntry {
  sequence: number;
  payload: string;
  checksum: string;
}
export interface JournalAdapter {
  append(entry: JournalEntry, expectedPrevious: number): Promise<void>;
  read(after: number): AsyncIterable<JournalEntry>;
}
export declare class JournalError extends Error {
  readonly code: 'invalid' | 'integrity' | 'limit' | 'busy';
  constructor(code: 'invalid' | 'integrity' | 'limit' | 'busy', message: string);
}
export declare function journalChecksum(sequence: number, payload: string): string;
export declare function createOperationJournal(
  adapter: JournalAdapter,
  after?: number,
  maxEntries?: number,
  maxPayloadBytes?: number,
): {
  checkpoint(): number;
  append(payload: string): Promise<JournalEntry>;
  replay(handler: (entry: JournalEntry) => void | Promise<void>): Promise<number>;
};
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
