/**
 * localStorage の読み書き。キーは部屋ごとに分離する。
 * 主催者トークン・編集トークンは URL には残さずここへ保存する。
 */

import { STORAGE_PREFIX } from '../../shared/constants';

export interface StoredPlayerCredential {
  playerId: string;
  editToken: string;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // プライベートモード等で失敗しても致命的ではない
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 無視
  }
}

const hostKey = (roomId: string): string => `${STORAGE_PREFIX}:room:${roomId}:host`;
const playerKey = (roomId: string): string => `${STORAGE_PREFIX}:room:${roomId}:player`;
const draftKey = (roomId: string): string => `${STORAGE_PREFIX}:room:${roomId}:draft`;

export function loadHostToken(roomId: string): string | null {
  return safeGet(hostKey(roomId));
}

export function saveHostToken(roomId: string, token: string): void {
  safeSet(hostKey(roomId), token);
}

export function clearHostToken(roomId: string): void {
  safeRemove(hostKey(roomId));
}

export function loadPlayerCredential(roomId: string): StoredPlayerCredential | null {
  const raw = safeGet(playerKey(roomId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredPlayerCredential).playerId === 'string' &&
      typeof (parsed as StoredPlayerCredential).editToken === 'string'
    ) {
      return parsed as StoredPlayerCredential;
    }
  } catch {
    // 壊れた値は破棄する
  }
  safeRemove(playerKey(roomId));
  return null;
}

export function savePlayerCredential(roomId: string, credential: StoredPlayerCredential): void {
  safeSet(playerKey(roomId), JSON.stringify(credential));
}

export function clearPlayerCredential(roomId: string): void {
  safeRemove(playerKey(roomId));
}

/** 入力途中のフォーム内容（通信が切れても失わないように保存する） */
export function loadDraft<T>(roomId: string): T | null {
  const raw = safeGet(draftKey(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    safeRemove(draftKey(roomId));
    return null;
  }
}

export function saveDraft<T>(roomId: string, draft: T): void {
  safeSet(draftKey(roomId), JSON.stringify(draft));
}

export function clearDraft(roomId: string): void {
  safeRemove(draftKey(roomId));
}
