export interface JournalEntry {
  sequence: number;
  payload: string;
  checksum: string;
}
export interface JournalAdapter {
  append(entry: JournalEntry, expectedPrevious: number): Promise<void>;
  read(after: number): AsyncIterable<JournalEntry>;
}
export class JournalError extends Error {
  constructor(
    readonly code: 'invalid' | 'integrity' | 'limit' | 'busy',
    message: string,
  ) {
    super(message);
    this.name = 'JournalError';
  }
}
export function journalChecksum(sequence: number, payload: string): string {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    typeof payload !== 'string' ||
    new TextEncoder().encode(payload).length > 16777216
  )
    throw new JournalError('invalid', 'Invalid checksum input.');
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(`${sequence}:${payload}`))
    hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function createOperationJournal(
  adapter: JournalAdapter,
  after = 0,
  maxEntries = 10000,
  maxPayloadBytes = 1048576,
) {
  if (
    !adapter ||
    typeof adapter.append !== 'function' ||
    typeof adapter.read !== 'function' ||
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !Number.isSafeInteger(maxEntries) ||
    maxEntries < 1 ||
    maxEntries > 100000 ||
    !Number.isSafeInteger(maxPayloadBytes) ||
    maxPayloadBytes < 1 ||
    maxPayloadBytes > 16777216
  )
    throw new JournalError('invalid', 'Invalid adapter/checkpoint/bounds.');
  let sequence = after;
  let busy = false;
  const validPayload = (payload: string): void => {
    if (typeof payload !== 'string') throw new JournalError('invalid', 'Payload must be a string.');
    if (new TextEncoder().encode(payload).length > maxPayloadBytes)
      throw new JournalError('limit', 'Payload too large.');
  };
  return {
    checkpoint(): number {
      return sequence;
    },
    async append(payload: string): Promise<JournalEntry> {
      if (busy) throw new JournalError('busy', 'Journal already operating.');
      validPayload(payload);
      if (sequence === Number.MAX_SAFE_INTEGER)
        throw new JournalError('limit', 'Sequence exhausted.');
      busy = true;
      try {
        const entry = {
          sequence: sequence + 1,
          payload,
          checksum: journalChecksum(sequence + 1, payload),
        };
        await adapter.append({ ...entry }, sequence);
        sequence++;
        return entry;
      } finally {
        busy = false;
      }
    },
    async replay(handler: (entry: JournalEntry) => void | Promise<void>): Promise<number> {
      if (busy) throw new JournalError('busy', 'Journal already operating.');
      if (typeof handler !== 'function') throw new JournalError('invalid', 'Handler required.');
      busy = true;
      try {
        let count = 0;
        for await (const entry of adapter.read(sequence)) {
          if (++count > maxEntries) throw new JournalError('limit', 'Replay bound exceeded.');
          if (!entry || entry.sequence !== sequence + 1)
            throw new JournalError('integrity', 'Noncontiguous journal.');
          validPayload(entry.payload);
          if (journalChecksum(entry.sequence, entry.payload) !== entry.checksum)
            throw new JournalError('integrity', 'Checksum mismatch.');
          await handler({ ...entry });
          sequence = entry.sequence;
        }
        return count;
      } finally {
        busy = false;
      }
    },
  };
}
