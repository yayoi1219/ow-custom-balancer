import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX_LENGTH } from '../src/shared/constants';
import {
  formatRank,
  normalizeLegacyRank,
  rankToScore,
  scoreToRank,
  tierHasDivisions,
  MAX_RANK_SCORE,
} from '../src/shared/ranks';
import {
  displayNameSchema,
  hasForbiddenChar,
  normalizedKey,
  normalizeText,
  playerInputSchema,
  rankSchema,
  updateActivePlayersRequestSchema,
} from '../src/shared/validation';
import { formatDiscordResult } from '../src/shared/discord';
import type { TeamCandidate } from '../src/shared/types';

describe('ランク変換', () => {
  it('仕様どおりの連続整数へ変換する', () => {
    expect(rankToScore({ tier: 'bronze', division: 5 })).toBe(0);
    expect(rankToScore({ tier: 'bronze', division: 1 })).toBe(4);
    expect(rankToScore({ tier: 'silver', division: 5 })).toBe(5);
    // Emerald は Platinum と Diamond の間
    expect(rankToScore({ tier: 'platinum', division: 1 })).toBe(19);
    expect(rankToScore({ tier: 'emerald', division: 5 })).toBe(20);
    expect(rankToScore({ tier: 'emerald', division: 1 })).toBe(24);
    expect(rankToScore({ tier: 'diamond', division: 5 })).toBe(25);
    expect(rankToScore({ tier: 'grandmaster', division: 1 })).toBe(39);
    // Champion はディビジョンを持たないので1段だけ
    expect(rankToScore({ tier: 'champion' })).toBe(40);
    expect(MAX_RANK_SCORE).toBe(40);
  });

  it('スコアからランクへ戻せる', () => {
    for (let score = 0; score <= MAX_RANK_SCORE; score += 1) {
      expect(rankToScore(scoreToRank(score))).toBe(score);
    }
    expect(formatRank(scoreToRank(22))).toBe('Emerald 3');
    expect(formatRank(scoreToRank(39))).toBe('Grandmaster 1');
    // ディビジョンなしのティアは番号を付けない
    expect(formatRank(scoreToRank(40))).toBe('Champion');
  });

  it('不正なランクは例外になる', () => {
    expect(() => rankToScore({ tier: 'gold', division: 0 })).toThrow();
    expect(() => rankToScore({ tier: 'gold', division: 6 })).toThrow();
    expect(() => rankToScore({ tier: 'gold' })).toThrow();
    expect(() => scoreToRank(41)).toThrow();
    expect(() => scoreToRank(-1)).toThrow();
  });
});

describe('ディビジョンを持たないティア（Champion）', () => {
  it('ディビジョンの有無をティアごとに判定できる', () => {
    expect(tierHasDivisions('grandmaster')).toBe(true);
    expect(tierHasDivisions('champion')).toBe(false);
  });

  it('Champion はディビジョン無しで受け付ける', () => {
    const result = rankSchema.safeParse({ tier: 'champion' });
    expect(result.success).toBe(true);
  });

  it('Champion にディビジョンを付けると拒否する', () => {
    const result = rankSchema.safeParse({ tier: 'champion', division: 1 });
    expect(result.success).toBe(false);
  });

  it('ディビジョンを持つティアでディビジョン未指定は拒否する', () => {
    expect(rankSchema.safeParse({ tier: 'diamond' }).success).toBe(false);
    expect(rankSchema.safeParse({ tier: 'diamond', division: 3 }).success).toBe(true);
    expect(rankSchema.safeParse({ tier: 'diamond', division: 6 }).success).toBe(false);
  });

  it('スコアとの相互変換が全域で往復する', () => {
    for (let score = 0; score <= MAX_RANK_SCORE; score += 1) {
      expect(rankToScore(scoreToRank(score))).toBe(score);
    }
    expect(scoreToRank(40)).toEqual({ tier: 'champion' });
    expect(scoreToRank(20)).toEqual({ tier: 'emerald', division: 5 });
  });
});

describe('旧仕様データの読み替え', () => {
  it('旧称 ultimate を champion として扱う', () => {
    expect(normalizeLegacyRank({ tier: 'ultimate', division: 1 })).toEqual({ tier: 'champion' });
  });

  it('Champion に付いていた旧ディビジョンを取り除く', () => {
    expect(normalizeLegacyRank({ tier: 'champion', division: 3 })).toEqual({ tier: 'champion' });
  });

  it('推定フラグとプレイ歴は引き継ぐ', () => {
    expect(
      normalizeLegacyRank({ tier: 'gold', division: 2, estimated: true, experience: 'rare' }),
    ).toEqual({ tier: 'gold', division: 2, estimated: true, experience: 'rare' });
  });

  it('壊れた値は null を返す', () => {
    expect(normalizeLegacyRank({ tier: 'legend', division: 1 })).toBeNull();
    expect(normalizeLegacyRank(null)).toBeNull();
    expect(normalizeLegacyRank('gold')).toBeNull();
  });
});

describe('表示名の正規化と検証', () => {
  it('前後空白を除去し NFKC 正規化する', () => {
    expect(normalizeText('  ＡＢＣ  ')).toBe('ABC');
    expect(normalizeText('ﾃｽﾄ')).toBe('テスト');
  });

  it('大文字小文字と正規化後の値で重複を判定する', () => {
    expect(normalizedKey('Player One')).toBe(normalizedKey('  ｐｌａｙｅｒ  Ｏｎｅ '));
  });

  it('Unicode を許可する', () => {
    const result = displayNameSchema.safeParse('ぷれいやー🐸');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('ぷれいやー🐸');
  });

  it('制御文字入りの名前を拒否する', () => {
    const tab = String.fromCharCode(0x09);
    const newline = String.fromCharCode(0x0a);
    const zeroWidth = String.fromCharCode(0x200b);
    const bom = String.fromCharCode(0xfeff);
    expect(hasForbiddenChar('a' + tab + 'b')).toBe(true);
    expect(hasForbiddenChar('a' + newline + 'b')).toBe(true);
    expect(hasForbiddenChar('a' + zeroWidth + 'b')).toBe(true);
    expect(hasForbiddenChar('a' + bom)).toBe(true);
    expect(hasForbiddenChar('普通の名前')).toBe(false);
    expect(displayNameSchema.safeParse('bad' + newline + 'name').success).toBe(false);
    expect(displayNameSchema.safeParse('bad' + zeroWidth + 'name').success).toBe(false);
  });

  it('長すぎる名前を拒否する', () => {
    const tooLong = 'あ'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    expect(displayNameSchema.safeParse(tooLong).success).toBe(false);
    expect(displayNameSchema.safeParse('あ'.repeat(DISPLAY_NAME_MAX_LENGTH)).success).toBe(true);
  });

  it('空文字・空白のみを拒否する', () => {
    expect(displayNameSchema.safeParse('').success).toBe(false);
    expect(displayNameSchema.safeParse('    ').success).toBe(false);
  });
});

describe('参加者入力の検証', () => {
  const base = {
    displayName: 'テスト',
    eligibleRoles: ['tank', 'support'],
    rolePreferenceGroups: [['support'], ['tank']],
    roleRanks: {
      tank: { tier: 'gold', division: 3 },
      support: { tier: 'platinum', division: 1 },
    },
  };

  it('正しい入力を受け付ける', () => {
    expect(playerInputSchema.safeParse(base).success).toBe(true);
  });

  it('参加可能ロールのランクが無い場合は拒否する', () => {
    const result = playerInputSchema.safeParse({
      ...base,
      roleRanks: { tank: { tier: 'gold', division: 3 } },
    });
    expect(result.success).toBe(false);
  });

  it('参加可能にしていないロールのランクは拒否する', () => {
    const result = playerInputSchema.safeParse({
      ...base,
      roleRanks: { ...base.roleRanks, damage: { tier: 'gold', division: 3 } },
    });
    expect(result.success).toBe(false);
  });

  it('希望順位が参加可能ロールと一致しない場合は拒否する', () => {
    const result = playerInputSchema.safeParse({ ...base, rolePreferenceGroups: [['tank']] });
    expect(result.success).toBe(false);
  });

  it('不正なロールを拒否する', () => {
    const result = playerInputSchema.safeParse({
      ...base,
      eligibleRoles: ['healer'],
      rolePreferenceGroups: [['healer']],
      roleRanks: {},
    });
    expect(result.success).toBe(false);
  });

  it('不正なランクを拒否する', () => {
    expect(
      playerInputSchema.safeParse({
        ...base,
        roleRanks: { ...base.roleRanks, tank: { tier: 'legend', division: 3 } },
      }).success,
    ).toBe(false);
    expect(
      playerInputSchema.safeParse({
        ...base,
        roleRanks: { ...base.roleRanks, tank: { tier: 'gold', division: 9 } },
      }).success,
    ).toBe(false);
  });

  it('ロール未選択を拒否する', () => {
    const result = playerInputSchema.safeParse({
      ...base,
      eligibleRoles: [],
      rolePreferenceGroups: [],
      roleRanks: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('アクティブ参加者の指定', () => {
  it('11人以上は拒否する', () => {
    const ids = Array.from({ length: 11 }, (_, index) => `player${index}`);
    expect(updateActivePlayersRequestSchema.safeParse({ playerIds: ids }).success).toBe(false);
  });

  it('重複したIDは拒否する', () => {
    expect(
      updateActivePlayersRequestSchema.safeParse({ playerIds: ['a1234567', 'a1234567'] }).success,
    ).toBe(false);
  });

  it('10人ちょうどは受け付ける', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `player${index}`);
    expect(updateActivePlayersRequestSchema.safeParse({ playerIds: ids }).success).toBe(true);
  });
});

describe('Discord用テキスト', () => {
  const candidate: TeamCandidate = {
    id: 'abc',
    teamA: {
      players: [
        {
          playerId: '1',
          displayName: 'Player 1',
          role: 'tank',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '2',
          displayName: 'Player 2',
          role: 'damage',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '3',
          displayName: 'Player 3',
          role: 'damage',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '4',
          displayName: 'Player 4',
          role: 'support',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '5',
          displayName: 'Player 5',
          role: 'support',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
      ],
      totalRank: 100,
    },
    teamB: {
      players: [
        {
          playerId: '6',
          displayName: 'Player 6',
          role: 'tank',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '7',
          displayName: 'Player 7',
          role: 'damage',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '8',
          displayName: 'Player 8',
          role: 'damage',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '9',
          displayName: 'Player 9',
          role: 'support',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
        {
          playerId: '10',
          displayName: 'Player 10',
          role: 'support',
          rankScore: 20,
          preferenceRank: 1,
          preferencePenalty: 0,
        },
      ],
      totalRank: 100,
    },
    score: 0,
    totalRankDiff: 0,
    tankRankDiff: 0,
    damageAvgDiff: 0,
    supportAvgDiff: 0,
    positionalRankDiff: 0,
    preferencePenalty: 0,
  };

  it('仕様どおりの形式で出力する', () => {
    const text = formatDiscordResult(candidate, '金曜カスタム');
    expect(text).toBe(
      [
        '🔵 TEAM A',
        'Tank: Player 1',
        'Damage: Player 2 / Player 3',
        'Support: Player 4 / Player 5',
        '',
        '🔴 TEAM B',
        'Tank: Player 6',
        'Damage: Player 7 / Player 8',
        'Support: Player 9 / Player 10',
        '',
        '部屋名: 金曜カスタム',
        '',
      ].join('\n'),
    );
  });
});
