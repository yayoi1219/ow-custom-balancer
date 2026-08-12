/**
 * 部屋のリアルタイム同期。
 *
 * - 初期状態は HTTP API から取得する（WebSocket に依存しない）
 * - WebSocket は更新通知として使い、切断時は指数バックオフで再接続する
 * - 再接続のたびに完全なスナップショットを取得し直す
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
} from '../../shared/constants';
import { ERROR_CODES } from '../../shared/errors';
import type { RoomSnapshot, ServerMessage, ViewerInfo } from '../../shared/types';
import { ApiError, api } from '../lib/api';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface RoomChannel {
  room: RoomSnapshot | null;
  viewer: ViewerInfo;
  connection: ConnectionState;
  expired: boolean;
  notFound: boolean;
  loading: boolean;
  errorMessage: string | null;
  /** HTTP レスポンスの結果を即座に反映する */
  applyState: (room: RoomSnapshot, viewer: ViewerInfo) => void;
  /** 手動で最新状態を取り直す */
  refresh: () => void;
}

const GUEST_VIEWER: ViewerInfo = { role: 'guest', playerId: null };

export function useRoomChannel(roomId: string, token: string | null): RoomChannel {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [viewer, setViewer] = useState<ViewerInfo>(GUEST_VIEWER);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [expired, setExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const tokenRef = useRef(token);
  const hasStateRef = useRef(false);

  tokenRef.current = token;

  const applyState = useCallback((nextRoom: RoomSnapshot, nextViewer: ViewerInfo) => {
    hasStateRef.current = true;
    setRoom(nextRoom);
    setViewer(nextViewer);
    setExpired(nextRoom.status === 'expired' || nextRoom.status === 'deleted');
    setLoading(false);
    setErrorMessage(null);
  }, []);

  /** HTTP から完全なスナップショットを取得する */
  const fetchState = useCallback(async () => {
    try {
      const result = await api.getRoom(roomId, tokenRef.current);
      applyState(result.room, result.viewer);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === ERROR_CODES.ROOM_EXPIRED) {
          setExpired(true);
          setLoading(false);
          return;
        }
        if (error.code === ERROR_CODES.ROOM_NOT_FOUND) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setErrorMessage(error.message);
      }
      setLoading(false);
    }
  }, [roomId, applyState]);

  const refresh = useCallback(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    closedRef.current = false;
    attemptRef.current = 0;
    hasStateRef.current = false;
    setLoading(true);
    setExpired(false);
    setNotFound(false);

    const clearTimers = (): void => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (closedRef.current) return;
      if (reconnectTimerRef.current !== null) return;
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }
      setConnection('reconnecting');
      const attempt = attemptRef.current;
      attemptRef.current = attempt + 1;
      // 指数バックオフ + ジッター
      const base = Math.min(WS_RECONNECT_BASE_DELAY_MS * 2 ** attempt, WS_RECONNECT_MAX_DELAY_MS);
      const delay = base / 2 + Math.random() * (base / 2);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const connect = (): void => {
      if (closedRef.current) return;
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }
      setConnection(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomId)}/ws`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (closedRef.current) {
          socket.close();
          return;
        }
        attemptRef.current = 0;
        setConnection('open');
        // 認証（トークンは URL ではなくメッセージで送る）
        if (tokenRef.current) {
          socket.send(JSON.stringify({ type: 'auth', token: tokenRef.current }));
        }
        // 再接続時は完全なスナップショットを取り直す
        void fetchState();

        heartbeatTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, WS_HEARTBEAT_INTERVAL_MS);
      });

      socket.addEventListener('message', (event: MessageEvent<string>) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === 'snapshot') {
          // 認証前のゲストスナップショットで権限表示が一瞬落ちるのを防ぐ
          if (tokenRef.current && message.viewer.role === 'guest' && hasStateRef.current) {
            return;
          }
          applyState(message.room, message.viewer);
          return;
        }
        if (message.type === 'expired') {
          setExpired(true);
          setLoading(false);
          return;
        }
        if (message.type === 'error') {
          if (message.code === ERROR_CODES.ROOM_NOT_FOUND) {
            setNotFound(true);
            setLoading(false);
          }
        }
      });

      const handleDown = (): void => {
        if (heartbeatTimerRef.current !== null) {
          window.clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        if (socketRef.current === socket) socketRef.current = null;
        scheduleReconnect();
      };

      socket.addEventListener('close', handleDown);
      socket.addEventListener('error', handleDown);
    };

    // まず HTTP で初期状態を取得し、その後 WebSocket を張る
    void fetchState();
    connect();

    const handleOnline = (): void => {
      attemptRef.current = 0;
      if (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN) {
        scheduleReconnect();
      }
    };
    const handleOffline = (): void => setConnection('offline');
    const handleVisibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN) {
        attemptRef.current = 0;
        scheduleReconnect();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      closedRef.current = true;
      clearTimers();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        try {
          socket.close(1000, 'leaving room');
        } catch {
          // 無視
        }
      }
    };
  }, [roomId, fetchState, applyState]);

  // トークンが後から手に入った場合（参加登録直後など）は認証だけやり直す
  useEffect(() => {
    const socket = socketRef.current;
    if (token && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'auth', token }));
    }
  }, [token]);

  return {
    room,
    viewer,
    connection,
    expired,
    notFound,
    loading,
    errorMessage,
    applyState,
    refresh,
  };
}
