import { describe, expect, it } from 'vitest';
import type { AppData } from '../domain/types';
import { emptyData } from './storage';
import { newTx, remove, upsert } from './actions';
import { SyncEngine, type CloudApi, type SyncStatus } from './sync';
import { mergeData } from './merge';

/** In-memory stand-in for the Supabase household row. */
class FakeServer {
  data: unknown = {};
  version = 1;
  listeners: ((v: number) => void)[] = [];
  offline = false;
  api(): CloudApi {
    const self = this;
    const guard = () => { if (self.offline) throw new Error('Failed to fetch'); };
    return {
      async fetch() { guard(); return { data: JSON.parse(JSON.stringify(self.data)), version: self.version }; },
      async fetchVersion() { guard(); return self.version; },
      async save(_id, data, expected) {
        guard();
        if (expected !== self.version) return -1;
        self.data = JSON.parse(JSON.stringify(data));
        self.version++;
        const v = self.version;
        setTimeout(() => self.listeners.forEach((l) => l(v)), 0);
        return v;
      },
      subscribe(_id, cb) { self.listeners.push(cb); return () => { self.listeners = self.listeners.filter((l) => l !== cb); }; },
    };
  }
}

/** A device = its local data + a sync engine. */
function device(server: FakeServer, initial: AppData, version = 0) {
  const d = { data: initial, status: 'starting' as SyncStatus, engine: null as unknown as SyncEngine };
  d.engine = new SyncEngine(server.api(), 'h1', version, {
    getData: () => d.data,
    applyRemote: (x) => { d.data = x; },
    onStatus: (s) => { d.status = s; },
    onVersion: () => {},
  }, 5);
  return d;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const tx = (id: string, amount = 1000) => ({ ...newTx({ kind: 'expense', amount, description: id, date: '2026-11-22', category: 'Groceries', person: 'joint' }), id });

describe('cloud sync', () => {
  it('first device uploads its data to an empty household', async () => {
    const server = new FakeServer();
    const duda = device(server, upsert(emptyData(), 'transactions', tx('coles')));
    await duda.engine.start();
    await wait();
    expect((server.data as AppData).transactions.map((t) => t.id)).toEqual(['coles']);
    expect(duda.status).toBe('synced');
  });

  it('second device receives data, and live changes flow both ways', async () => {
    const server = new FakeServer();
    const duda = device(server, upsert(emptyData(), 'transactions', tx('coles')));
    await duda.engine.start(); await wait();
    const patrick = device(server, emptyData());
    await patrick.engine.start(); await wait();
    expect(patrick.data.transactions.map((t) => t.id)).toEqual(['coles']);

    patrick.data = upsert(patrick.data, 'transactions', tx('fuel'));
    patrick.engine.localChanged(); await wait(60);
    expect(duda.data.transactions.map((t) => t.id).sort()).toEqual(['coles', 'fuel']);
  });

  it('simultaneous edits are merged, nothing is lost', async () => {
    const server = new FakeServer();
    const duda = device(server, emptyData());
    await duda.engine.start(); await wait();
    const patrick = device(server, emptyData());
    await patrick.engine.start(); await wait();
    // both edit before either upload reaches the other
    duda.data = upsert(duda.data, 'transactions', tx('coffee'));
    patrick.data = upsert(patrick.data, 'transactions', tx('rent'));
    await Promise.all([duda.engine.push(), patrick.engine.push()]);
    await wait(60);
    const ids = (d: AppData) => d.transactions.map((t) => t.id).sort();
    expect(ids(server.data as AppData)).toEqual(['coffee', 'rent']);
    expect(ids(duda.data)).toEqual(['coffee', 'rent']);
    expect(ids(patrick.data)).toEqual(['coffee', 'rent']);
  });

  it('a deletion on one phone is not undone by the other', async () => {
    const server = new FakeServer();
    const duda = device(server, upsert(upsert(emptyData(), 'transactions', tx('a')), 'transactions', tx('b')));
    await duda.engine.start(); await wait();
    const patrick = device(server, emptyData());
    await patrick.engine.start(); await wait();
    duda.data = remove(duda.data, 'transactions', 'a');
    patrick.data = upsert(patrick.data, 'transactions', tx('c'));
    await Promise.all([patrick.engine.push(), duda.engine.push()]);
    await wait(60);
    expect((server.data as AppData).transactions.map((t) => t.id).sort()).toEqual(['b', 'c']);
    expect(patrick.data.transactions.map((t) => t.id).sort()).toEqual(['b', 'c']);
  });

  it('works offline and uploads when back online', async () => {
    const server = new FakeServer();
    const duda = device(server, emptyData());
    await duda.engine.start(); await wait();
    server.offline = true;
    duda.data = upsert(duda.data, 'transactions', tx('offline-coffee'));
    await duda.engine.push();
    expect(duda.status).toBe('offline');
    expect(duda.data.transactions).toHaveLength(1); // still saved locally
    server.offline = false;
    await duda.engine.check(); await wait();
    expect((server.data as AppData).transactions.map((t) => t.id)).toEqual(['offline-coffee']);
    expect(duda.status).toBe('synced');
    duda.engine.stop();
  });

  it('merge: same record edited on both sides keeps the preferred one', () => {
    const base = upsert(emptyData(), 'transactions', tx('x', 1000));
    const mine = upsert(base, 'transactions', tx('x', 2000));
    const theirs = upsert(base, 'transactions', tx('x', 3000));
    expect(mergeData(mine, theirs).transactions[0].amount).toBe(2000);
  });
});
