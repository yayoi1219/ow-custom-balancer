/**
 * アプリ全体で共有する定数。
 * マジックナンバーはすべてここへ集約し、1か所で変更できるようにする。
 */

/** サービス名（変更する場合はここだけを書き換える） */
export const SERVICE_NAME = 'OW Custom Balancer';

/**
 * ロール定義。
 * 画面に出すロール名は言語ごとに変わるため、`src/shared/i18n/` の辞書が持つ
 * （ここに文言を置くと翻訳を素通りしてしまう）。
 */
export const ROLES = ['tank', 'damage', 'support'] as const;
export type Role = (typeof ROLES)[number];

/** 1チームあたりのロール枠（ロールキュー構成） */
export const TEAM_ROLE_SLOTS: Record<Role, number> = {
  tank: 1,
  damage: 2,
  support: 2,
};

/** 2チーム合計のロール枠 */
export const TOTAL_ROLE_SLOTS: Record<Role, number> = {
  tank: TEAM_ROLE_SLOTS.tank * 2,
  damage: TEAM_ROLE_SLOTS.damage * 2,
  support: TEAM_ROLE_SLOTS.support * 2,
};

/** 1チームの人数 */
export const TEAM_SIZE = TEAM_ROLE_SLOTS.tank + TEAM_ROLE_SLOTS.damage + TEAM_ROLE_SLOTS.support;

/** チーム分けに必要なアクティブ参加者数 */
export const REQUIRED_ACTIVE_PLAYERS = TEAM_SIZE * 2;

/** 1部屋の最大参加者数 */
export const MAX_PLAYERS = 20;

/** 返却するチーム候補の最大件数 */
export const MAX_CANDIDATES = 5;

/** 表示名の長さ制限（正規化後・コードポイント単位） */
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 24;
/** 正規化前に受け付ける生文字列の上限（過大な入力を早期に弾く） */
export const DISPLAY_NAME_RAW_MAX_LENGTH = 200;

/** 部屋名の長さ制限 */
export const ROOM_TITLE_MIN_LENGTH = 1;
export const ROOM_TITLE_MAX_LENGTH = 40;
export const ROOM_TITLE_RAW_MAX_LENGTH = 300;

/** 部屋の有効期限（作成から24時間） */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** roomId のバイト長（128bit） */
export const ROOM_ID_BYTES = 16;
/** 権限トークンのバイト長（256bit） */
export const TOKEN_BYTES = 32;
/** playerId のバイト長 */
export const PLAYER_ID_BYTES = 12;

/** チーム評価の重み。小さいほど良いスコアになる。 */
export const BALANCE_WEIGHTS = {
  /** 両チーム総合ランク差 */
  totalRankDiff: 1.0,
  /** Tank同士のランク差 */
  tankRankDiff: 1.5,
  /** Damage平均ランク差 */
  damageAvgDiff: 1.0,
  /** Support平均ランク差 */
  supportAvgDiff: 1.0,
  /**
   * 上位者の偏り。
   * 各チームをランク降順に並べ、1番手同士・2番手同士…を比較した差の合計。
   * 合計が同じでも「片方に上位者が固まる」編成を避けるための項
   * （ランクが高い人から交互に振り分けるスネークドラフトに近い結果になる）。
   *
   * 大きくすると「各チームに同格のエースがいる」編成を強く優先し、
   * 小さくすると純粋な合計ランクの釣り合いを優先する。
   */
  positionalRankDiff: 1.0,
} as const;

/**
 * ロールごとのプレイ歴（自己申告）。
 * 公式に取得できる手段が無いため本人の申告を用いる。
 */
export const ROLE_EXPERIENCES = ['main', 'sub', 'rare'] as const;
export type RoleExperience = (typeof ROLE_EXPERIENCES)[number];

/**
 * 内部レートの補正値（ランクスコア基準、1 = 1ディビジョン）。
 *
 * 同じランクでも、普段やらないロールでは実際のパフォーマンスが落ちる。
 * ランクは「そのロールでの実測値」なので本来は補正不要だが、
 * 未計測（推定申告）の場合はランク自体が当てにならないため、
 * プレイ歴で内部レートを下方修正して過大評価を防ぐ。
 */
export const EXPERIENCE_ADJUSTMENT: Record<RoleExperience, number> = {
  main: 0,
  sub: -2,
  rare: -5,
};

/**
 * 未計測（推定申告）の場合に、プレイ歴による補正を適用する。
 * 実測ランクがある場合は補正しない（実測値のほうが信頼できるため）。
 */
export const APPLY_EXPERIENCE_ADJUSTMENT_ONLY_WHEN_ESTIMATED = true;

/** 希望順位（0始まり）に対するペナルティ。第1希望=0, 第2希望=6, 第3希望=15。 */
export const PREFERENCE_PENALTIES = [0, 6, 15] as const;
/** 希望リストに含まれないロールへ割り当てた場合のペナルティ（通常は発生しない） */
export const PREFERENCE_PENALTY_FALLBACK = 30;

/** レート制限の初期値 */
export const RATE_LIMITS = {
  /** 部屋作成: 同一識別元から10分に5回 */
  createRoom: { limit: 5, windowMs: 10 * 60 * 1000 },
  /** 新規参加: 同一識別元・同一部屋で1分に10回 */
  joinRoom: { limit: 10, windowMs: 60 * 1000 },
  /** その他の更新: 同一識別元・同一部屋で1分に30回 */
  mutate: { limit: 30, windowMs: 60 * 1000 },
} as const;

/** IP識別値をローテーションする間隔（この間だけ同一識別値になる） */
export const IP_HASH_ROTATION_MS = 60 * 60 * 1000;

/** レート制限DOが古いレコードを掃除する間隔 */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
/** レート制限レコードの保持上限（この時間を超えたものは掃除対象） */
export const RATE_LIMIT_RECORD_TTL_MS = 60 * 60 * 1000;

/** JSONリクエストボディの上限サイズ */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/** WebSocket 再接続のバックオフ設定 */
export const WS_RECONNECT_BASE_DELAY_MS = 1000;
export const WS_RECONNECT_MAX_DELAY_MS = 15000;
/** クライアントからのハートビート間隔 */
export const WS_HEARTBEAT_INTERVAL_MS = 25000;

/** localStorage キーの接頭辞 */
export const STORAGE_PREFIX = 'owcb';

/** 認証トークンを渡すHTTPヘッダー名 */
export const AUTH_HEADER = 'x-owcb-token';
