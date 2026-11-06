import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationJournal, journalChecksum, JournalError } from '../dist/esm/index.js';

test('documented workflow produces required outputs', async () => {
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
});
test('append adapter failures do not advance sequence', async () => {
  const j = createOperationJournal({
    async append() {
      throw Error('disk');
    },
    async *read() {},
  });
  await assert.rejects(j.append('a'), /disk/);
  assert.equal(j.checkpoint(), 0);
});
test('replay gaps and corruption reject', async () => {
  const j = createOperationJournal({
    async append() {},
    async *read() {
      yield { sequence: 1, payload: 'x', checksum: 'bad' };
    },
  });
  await assert.rejects(
    j.replay(() => {}),
    { code: 'integrity' },
  );
  assert.equal(j.checkpoint(), 0);
});
test('handler failure retains replay checkpoint', async () => {
  const j = createOperationJournal({
    async append() {},
    async *read() {
      yield { sequence: 1, payload: 'x', checksum: journalChecksum(1, 'x') };
    },
  });
  await assert.rejects(
    j.replay(() => {
      throw Error('handler');
    }),
    /handler/,
  );
  assert.equal(j.checkpoint(), 0);
});
test('payload size and sequence exhaustion reject', async () => {
  const a = { async append() {}, async *read() {} };
  await assert.rejects(createOperationJournal(a, 0, 10, 1).append('xx'), { code: 'limit' });
  await assert.rejects(createOperationJournal(a, Number.MAX_SAFE_INTEGER).append('x'), {
    code: 'limit',
  });
});
