/**
 * Zod によるサーバー／クライアント共通のバリデーション定義。
 * サーバー側は必ずここを通してから状態を変更する。
 */

import { z } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_RAW_MAX_LENGTH,
  MAX_PLAYERS,
  REQUIRED_ACTIVE_PLAYERS,
  ROLES,
  ROOM_TITLE_MAX_LENGTH,
  ROOM_TITLE_MIN_LENGTH,
  ROLE_EXPERIENCES,
  ROOM_TITLE_RAW_MAX_LENGTH,
  type Role,
} from './constants';
import { RANK_TIERS, RANK_TIER_LABELS, TIER_DIVISION_COUNT } from './ranks';

/**
 * 制御文字・不可視文字を含むかどうか。
 * C0/C1 制御文字、DEL、ゼロ幅文字、双方向制御文字、BOM を禁止する。
 */
export function hasForbiddenChar(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp <= 0x1f || cp === 0x7f) return true; // C0 + DEL
    if (cp >= 0x80 && cp <= 0x9f) return true; // C1
    if (cp >= 0x200b && cp <= 0x200f) return true; // ゼロ幅・方向指示
    if (cp >= 0x2028 && cp <= 0x202e) return true; // 行区切り・双方向制御
    if (cp >= 0x2060 && cp <= 0x2064) return true; // word joiner 等
    if (cp === 0xfeff) return true; // BOM
  }
  return false;
}

/** NFKC 正規化 + 前後空白除去 + 連続する半角スペースの圧縮 */
export function normalizeText(raw: string): string {
  return raw.normalize('NFKC').replace(/ {2,}/g, ' ').trim();
}

/** 重複判定に使う正規化キー（大文字小文字を無視） */
export function normalizedKey(displayName: string): string {
  return normalizeText(displayName).toLocaleLowerCase('en-US');
}

/** コードポイント単位の長さ */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizedNameSchema(min: number, max: number, rawMax: number, label: string) {
  return z
    .string({ message: `${label}を入力してください。` })
    .max(rawMax, { message: `${label}が長すぎます。` })
    .refine((value) => !hasForbiddenChar(value), {
      message: `${label}に使用できない文字が含まれています。`,
    })
    .transform((value) => normalizeText(value))
    .refine((value) => codePointLength(value) >= min, {
      message: `${label}を入力してください。`,
    })
    .refine((value) => codePointLength(value) <= max, {
      message: `${label}は${max}文字以内で入力してください。`,
    });
}

export const displayNameSchema = normalizedNameSchema(
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_RAW_MAX_LENGTH,
  '表示名',
);

export const roomTitleSchema = normalizedNameSchema(
  ROOM_TITLE_MIN_LENGTH,
  ROOM_TITLE_MAX_LENGTH,
  ROOM_TITLE_RAW_MAX_LENGTH,
  '部屋名',
);

export const roleSchema = z.enum(ROLES);

/**
 * ランク。ティアによってディビジョンの有無が変わる
 * （Champion はディビジョンを持たない）。
 */
export const rankSchema = z
  .object({
    tier: z.enum(RANK_TIERS),
    /** ディビジョンを持つティアでのみ必須 */
    division: z.number().int().optional(),
    /** 未計測（本人の推定値）かどうか。内部レートの補正と表示に使う。 */
    estimated: z.boolean().optional(),
    /** そのロールのプレイ歴（自己申告）。内部レートの補正に使う。 */
    experience: z.enum(ROLE_EXPERIENCES).optional(),
  })
  .superRefine((value, ctx) => {
    const divisions = TIER_DIVISION_COUNT[value.tier];
    if (divisions === 0) {
      // Champion 等はディビジョンを持たないため、指定されていたら誤り
      if (value.division !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['division'],
          message: `${RANK_TIER_LABELS[value.tier]} にディビジョンはありません。`,
        });
      }
      return;
    }
    if (value.division === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['division'],
        message: 'ランクのディビジョンを指定してください。',
      });
      return;
    }
    if (value.division < 1 || value.division > divisions) {
      ctx.addIssue({
        code: 'custom',
        path: ['division'],
        message: 'ランクのディビジョンが不正です。',
      });
    }
  });

export const roleRanksSchema = z.object({
  tank: rankSchema.optional(),
  damage: rankSchema.optional(),
  support: rankSchema.optional(),
});

const rolesArraySchema = z
  .array(roleSchema)
  .min(1, { message: '参加可能なロールを1つ以上選択してください。' })
  .max(ROLES.length, { message: 'ロールの指定が不正です。' });

/**
 * 希望順位。配列の配列で表し、同じ内側配列に入るロールは同順位（どちらでもよい）。
 * 例: [['tank','support'], ['damage']]
 */
export const preferenceGroupsSchema = z
  .array(z.array(roleSchema).min(1).max(ROLES.length))
  .min(1, { message: '希望順位を設定してください。' })
  .max(ROLES.length, { message: '希望順位の指定が不正です。' });

/** 参加登録／更新の入力 */
export const playerInputSchema = z
  .object({
    displayName: displayNameSchema,
    eligibleRoles: rolesArraySchema,
    rolePreferenceGroups: preferenceGroupsSchema,
    roleRanks: roleRanksSchema,
  })
  .superRefine((value, ctx) => {
    const eligible = value.eligibleRoles;
    const unique = new Set<Role>(eligible);
    if (unique.size !== eligible.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['eligibleRoles'],
        message: '参加可能なロールが重複しています。',
      });
      return;
    }

    // 希望順位は参加可能ロールをすべて1回ずつ含む必要がある（同順位は許可）
    const flattened = value.rolePreferenceGroups.flat();
    const prefUnique = new Set<Role>(flattened);
    const sameSet =
      prefUnique.size === flattened.length &&
      prefUnique.size === unique.size &&
      [...unique].every((role) => prefUnique.has(role));
    if (!sameSet) {
      ctx.addIssue({
        code: 'custom',
        path: ['rolePreferenceGroups'],
        message: '希望順位は参加可能なロールをすべて1回ずつ含める必要があります。',
      });
    }

    // 参加可能ロールにはランク入力が必須。逆に不要なランクは受け付けない。
    for (const role of ROLES) {
      const hasRank = value.roleRanks[role] !== undefined;
      const isEligible = unique.has(role);
      if (isEligible && !hasRank) {
        ctx.addIssue({
          code: 'custom',
          path: ['roleRanks', role],
          message: '参加可能にしたロールのランクを入力してください。',
        });
      }
      if (!isEligible && hasRank) {
        ctx.addIssue({
          code: 'custom',
          path: ['roleRanks', role],
          message: '参加可能にしていないロールのランクは指定できません。',
        });
      }
    }
  });

export type PlayerInputParsed = z.infer<typeof playerInputSchema>;

/** Turnstile トークン */
export const turnstileTokenSchema = z
  .string({ message: '認証（Turnstile）を完了してください。' })
  .min(1, { message: '認証（Turnstile）を完了してください。' })
  .max(4096, { message: '認証トークンが不正です。' });

export const createRoomRequestSchema = z.object({
  title: roomTitleSchema,
  turnstileToken: turnstileTokenSchema,
});

export const joinRoomRequestSchema = z.object({
  player: playerInputSchema,
  turnstileToken: turnstileTokenSchema,
});

export const updatePlayerRequestSchema = z.object({
  player: playerInputSchema,
});

export const updateStatusRequestSchema = z.object({
  status: z.enum(['open', 'closed']),
});

export const updateActivePlayersRequestSchema = z.object({
  playerIds: z
    .array(z.string().min(1).max(64))
    .max(MAX_PLAYERS, { message: '選択できる人数を超えています。' })
    .refine((ids) => new Set(ids).size === ids.length, {
      message: '同じ参加者が重複して選択されています。',
    })
    .refine((ids) => ids.length <= REQUIRED_ACTIVE_PLAYERS, {
      message: `アクティブ参加者は最大${REQUIRED_ACTIVE_PLAYERS}人までです。`,
    }),
});

/** 手動調整した編成（10人分の配置） */
export const lineupSchema = z
  .array(
    z.object({
      playerId: z.string().min(1).max(64),
      role: roleSchema,
      team: z.enum(['A', 'B']),
    }),
  )
  .length(REQUIRED_ACTIVE_PLAYERS, {
    message: `編成には${REQUIRED_ACTIVE_PLAYERS}人が必要です。`,
  });

export const startDraftRequestSchema = z.object({
  captainA: z.object({ playerId: z.string().min(1).max(64), role: roleSchema }),
  captainB: z.object({ playerId: z.string().min(1).max(64), role: roleSchema }),
});

export const draftPickRequestSchema = z.object({
  playerId: z.string().min(1).max(64),
  role: roleSchema,
});

/** 保存済みドラフト状態の読み戻し */
export const draftStateSchema = z.object({
  status: z.enum(['active', 'completed']),
  captains: z.object({ A: z.string(), B: z.string() }),
  picks: z.array(z.object({ playerId: z.string(), role: roleSchema, team: z.enum(['A', 'B']) })),
  order: z.array(z.enum(['A', 'B'])),
});

/**
 * チーム確定のリクエスト。
 * 生成した候補を選ぶ場合と、主催者が手動調整した編成を送る場合がある。
 */
export const selectCandidateRequestSchema = z.union([
  z.object({ candidateId: z.string().min(1).max(64) }),
  z.object({ lineup: lineupSchema }),
]);

/* --- 保存済み JSON を読み戻すためのスキーマ（型安全な変換） --- */

export const rolesJsonSchema = z.array(roleSchema).min(1).max(ROLES.length);
export const preferenceGroupsJsonSchema = preferenceGroupsSchema;

export const assignedPlayerSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  role: roleSchema,
  rankScore: z.number().int(),
  rating: z.number().optional(),
  rankEstimated: z.boolean().optional(),
  experience: z.enum(ROLE_EXPERIENCES).optional(),
  preferenceRank: z.number().int(),
  preferencePenalty: z.number(),
});

export const teamCompositionSchema = z.object({
  players: z.array(assignedPlayerSchema),
  totalRank: z.number(),
});

export const teamCandidateSchema = z.object({
  id: z.string(),
  teamA: teamCompositionSchema,
  teamB: teamCompositionSchema,
  score: z.number(),
  totalRankDiff: z.number(),
  tankRankDiff: z.number(),
  damageAvgDiff: z.number(),
  supportAvgDiff: z.number(),
  positionalRankDiff: z.number(),
  preferencePenalty: z.number(),
});

export const teamCandidateListSchema = z.array(teamCandidateSchema);

/** roomId / playerId の形式（base64url 相当） */
export const idPathSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/u, { message: 'IDの形式が不正です。' });

/** Zod のエラーを利用者向けメッセージ配列へ変換する */
export function formatIssues(error: z.ZodError): string[] {
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const issue of error.issues) {
    if (!seen.has(issue.message)) {
      seen.add(issue.message);
      messages.push(issue.message);
    }
  }
  return messages;
}

/** ロールを正規の並び順へ整列する（保存時の安定化） */
export function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
}
