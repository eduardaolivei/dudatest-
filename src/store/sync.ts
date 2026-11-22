import type { AppData } from '../domain/types';
import { mergeData } from './merge';
import { normalize } from './storage';

/** What the sync engine needs from the server (Supabase in the app, a fake in tests). */
export interface CloudApi {
  fetch(householdId: string): Promise<{ data: unknown; version: number }>;
  fetchVersion(householdId: string): Promise<number>;
  save(householdId: string, data: AppData, expectedVersion: number): Promise<number>; // new version, or -1 on conflict
  subscribe(householdId: string, onChange: (version: number) => void): () => void;
}

export type SyncStatus = 'starting' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncHooks {
  getData: () => AppData;
  /** Show data that came from the server. `push` = it also needs uploading (it was merged). */
  applyRemote: (data: AppData) => void;
  onStatus: (s: SyncStatus, info?: { error?: string; at?: number }) => void;
  onVersion: (v: number) => void;
}

const isEmptyDoc = (d: unknown) => !d || typeof d !== 'object' || Object.keys(d as object).length === 0;

/**
 * Keeps this device and the household copy in the cloud in step.
 * - Local changes are uploaded shortly after they happen (debounced).
 * - Saves use a version number; if the other person saved first, we merge and retry.
 * - Changes from the other person arrive via realtime (plus a periodic check as backup).
 * - If offline, it keeps working locally and retries later.
 */
export class SyncEngine {
  private dirty = false;
  private pushing = false;
  private pushAgain = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private unsub: (() => void) | undefined;
  private stopped = false;

  constructor(
    private api: CloudApi,
    private householdId: string,
    private version: number,
    private hooks: SyncHooks,
    private debounceMs = 1200,
  ) {}

  get currentVersion() {
    return this.version;
  }

  async start() {
    this.hooks.onStatus('starting');
    this.unsub = this.api.subscribe(this.householdId, (v) => void this.onRemoteVersion(v));
    await this.pull();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.retry);
    this.unsub?.();
  }

  /** Call whenever the user changes something on this device. */
  localChanged() {
    if (this.stopped) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), this.debounceMs);
  }

  /** Check the server for a newer version (on focus, periodically, or when told). */
  async check() {
    if (this.stopped) return;
    try {
      const v = await this.api.fetchVersion(this.householdId);
      if (v > this.version) await this.pull();
      else if (this.dirty) await this.push();
      else this.hooks.onStatus('synced', { at: Date.now() });
    } catch (e) {
      this.fail(e);
    }
  }

  private async onRemoteVersion(v: number) {
    if (v > this.version) await this.pull();
  }

  /** Download the household copy; merge with local edits that haven't been uploaded yet. */
  async pull() {
    if (this.stopped) return;
    try {
      this.hooks.onStatus('syncing');
      const remote = await this.api.fetch(this.householdId);
      if (isEmptyDoc(remote.data)) {
        // Nothing in the cloud yet: upload what this device has.
        this.setVersion(remote.version);
        this.dirty = true;
      } else if (remote.version > this.version) {
        const remoteData = normalize(remote.data);
        this.setVersion(remote.version);
        if (this.dirty) {
          this.hooks.applyRemote(mergeData(this.hooks.getData(), remoteData));
          await this.push();
          return;
        }
        this.hooks.applyRemote(remoteData);
      }
      if (this.dirty) await this.push();
      else this.hooks.onStatus('synced', { at: Date.now() });
    } catch (e) {
      this.fail(e);
    }
  }

  /** Upload local data. On conflict: fetch theirs, merge (ours wins per record), retry. */
  async push(): Promise<void> {
    if (this.stopped) return;
    clearTimeout(this.timer);
    if (this.pushing) {
      this.pushAgain = true;
      return;
    }
    this.pushing = true;
    try {
      this.hooks.onStatus('syncing');
      let saved = false;
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        const data = this.hooks.getData();
        this.dirty = false;
        const v = await this.api.save(this.householdId, data, this.version);
        if (v > 0) {
          this.setVersion(v);
          saved = true;
          break;
        }
        // Someone else saved first: bring their changes in and try again.
        const remote = await this.api.fetch(this.householdId);
        this.setVersion(remote.version);
        this.hooks.applyRemote(mergeData(this.hooks.getData(), normalize(remote.data)));
        this.dirty = true;
      }
      if (saved) this.hooks.onStatus('synced', { at: Date.now() });
      else {
        this.dirty = true;
        this.hooks.onStatus('error', { error: 'Could not save after several tries' });
      }
    } catch (e) {
      this.dirty = true;
      this.fail(e);
    } finally {
      this.pushing = false;
      if (this.pushAgain) {
        this.pushAgain = false;
        void this.push();
      }
    }
  }

  private setVersion(v: number) {
    this.version = v;
    this.hooks.onVersion(v);
  }

  private fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|Failed to fetch|Load failed/i.test(msg);
    this.hooks.onStatus(offline ? 'offline' : 'error', { error: msg });
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void (this.dirty ? this.push() : this.check()), offline ? 15000 : 30000);
  }
}
