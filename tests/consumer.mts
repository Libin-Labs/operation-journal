import { createOperationJournal, journalChecksum, JournalError } from '@lp-labs/operation-journal';
const publicAPI = [createOperationJournal, journalChecksum, JournalError];
const apiCount: number = publicAPI.length;
void apiCount;
const journal = createOperationJournal({ async append() {}, async *read() {} });
const checkpoint: number = journal.checkpoint();
void checkpoint;
