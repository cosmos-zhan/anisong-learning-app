import { registerPlugin } from '@capacitor/core';
import type { InstalledApp, VerifiedUpdate } from '../core/updates';
export interface UpdateStatus { state: 'idle'|'downloading'|'verifying'|'ready'|'cancelled'|'error'; received: number; total: number; error?: string }
interface UpdateBridge {
  installed(): Promise<InstalledApp>;
  releases(): Promise<{ releases: unknown }>;
  buildInfo(options: { url: string }): Promise<{ info: unknown }>;
  download(options: VerifiedUpdate): Promise<void>;
  status(): Promise<UpdateStatus>;
  cancel(): Promise<void>;
  install(): Promise<{ permissionRequired: boolean }>;
}
export const updates = registerPlugin<UpdateBridge>('AnisongUpdates');
