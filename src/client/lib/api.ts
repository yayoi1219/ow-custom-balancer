/** API クライアント。統一されたエラー形式を扱う。 */

import type { LineupSlot } from '../../shared/balancer';
import { AUTH_HEADER, type Role } from '../../shared/constants';
import {
  ERROR_CODES,
  errorMessageFor,
  type ApiResponse,
  type ErrorCode,
} from '../../shared/errors';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  PlayerInput,
  PublicConfig,
  RecruitStatus,
  RoomStateResponse,
  TeamCandidatesResponse,
} from '../../shared/types';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: string[];

  constructor(code: ErrorCode, status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) {
    headers.set(AUTH_HEADER, options.token);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(ERROR_CODES.NETWORK_ERROR, 0, errorMessageFor(ERROR_CODES.NETWORK_ERROR));
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      response.status,
      errorMessageFor(ERROR_CODES.INTERNAL_ERROR),
    );
  }
  if (!payload.ok) {
    throw new ApiError(
      payload.error.code,
      response.status,
      payload.error.message,
      payload.error.details ?? [],
    );
  }
  return payload.data;
}

export const api = {
  getConfig: (signal?: AbortSignal): Promise<PublicConfig> =>
    request<PublicConfig>('/api/config', { signal }),

  createRoom: (title: string, turnstileToken: string): Promise<CreateRoomResponse> =>
    request<CreateRoomResponse>('/api/rooms', {
      method: 'POST',
      body: { title, turnstileToken },
    }),

  getRoom: (
    roomId: string,
    token: string | null,
    signal?: AbortSignal,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, { token, signal }),

  deleteRoom: (roomId: string, token: string): Promise<{ deleted: true }> =>
    request(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE', token }),

  joinRoom: (
    roomId: string,
    player: PlayerInput,
    turnstileToken: string,
  ): Promise<JoinRoomResponse> =>
    request<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/players`, {
      method: 'POST',
      body: { player, turnstileToken },
    }),

  updatePlayer: (
    roomId: string,
    playerId: string,
    player: PlayerInput,
    token: string,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(
      `/api/rooms/${encodeURIComponent(roomId)}/players/${encodeURIComponent(playerId)}`,
      { method: 'PATCH', body: { player }, token },
    ),

  removePlayer: (roomId: string, playerId: string, token: string): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(
      `/api/rooms/${encodeURIComponent(roomId)}/players/${encodeURIComponent(playerId)}`,
      { method: 'DELETE', token },
    ),

  setStatus: (roomId: string, status: RecruitStatus, token: string): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/status`, {
      method: 'PATCH',
      body: { status },
      token,
    }),

  setActivePlayers: (
    roomId: string,
    playerIds: string[],
    token: string,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/active-players`, {
      method: 'PATCH',
      body: { playerIds },
      token,
    }),

  generateCandidates: (roomId: string, token: string): Promise<TeamCandidatesResponse> =>
    request<TeamCandidatesResponse>(`/api/rooms/${encodeURIComponent(roomId)}/team-candidates`, {
      method: 'POST',
      token,
    }),

  selectCandidate: (
    roomId: string,
    candidateId: string,
    token: string,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/selected-candidate`, {
      method: 'POST',
      body: { candidateId },
      token,
    }),

  startDraft: (
    roomId: string,
    captainA: { playerId: string; role: Role },
    captainB: { playerId: string; role: Role },
    token: string,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>('/api/rooms/' + encodeURIComponent(roomId) + '/draft', {
      method: 'POST',
      body: { captainA, captainB },
      token,
    }),

  /** ドラフトでの指名（手番のキャプテン本人か主催者） */
  draftPick: (
    roomId: string,
    playerId: string,
    role: Role,
    token: string,
  ): Promise<RoomStateResponse> =>
    request<RoomStateResponse>('/api/rooms/' + encodeURIComponent(roomId) + '/draft/picks', {
      method: 'POST',
      body: { playerId, role },
      token,
    }),

  cancelDraft: (roomId: string, token: string): Promise<RoomStateResponse> =>
    request<RoomStateResponse>('/api/rooms/' + encodeURIComponent(roomId) + '/draft', {
      method: 'DELETE',
      token,
    }),

  /** 主催者が手動調整した編成を確定する */
  selectLineup: (roomId: string, lineup: LineupSlot[], token: string): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/selected-candidate`, {
      method: 'POST',
      body: { lineup },
      token,
    }),

  clearSelectedCandidate: (roomId: string, token: string): Promise<RoomStateResponse> =>
    request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/selected-candidate`, {
      method: 'DELETE',
      token,
    }),
};
