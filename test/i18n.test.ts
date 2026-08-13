import { describe, expect, it } from 'vitest';
import { generateTeamCandidates, type BalancePlayer } from '../src/shared/balancer';
import { REQUIRED_ACTIVE_PLAYERS, ROLES } from '../src/shared/constants';
import { formatDiscordResult } from '../src/shared/discord';
import { ERROR_CODES, errorMessageFor, type ErrorCode } from '../src/shared/errors';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_HTML_LANG,
  LOCALE_LABELS,
  en,
  formatRankLocalized,
  getMessages,
  isLocale,
  ja,
  ko,
  localeFromAcceptLanguage,
  resolveLocale,
  translateValidationKey,
  translateValidationKeys,
  zh,
  type Messages,
} from '../src/shared/i18n';
import { RANK_TIERS } from '../src/shared/ranks';
import type { TeamCandidate } from '../src/shared/types';
import { formatIssues, playerInputSchema } from '../src/shared/validation';

const BUNDLES: Record<string, Messages> = { ja, en, ko, zh };

/**
 * 辞書の形をたどって、葉ノードのパス一覧を作る。
 * 型チェックでもキーの過不足は検出できるが、
 * 「関数であるべき箇所が文字列になっている」ような取り違えはここで拾う。
 */
function describeShape(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') return [`${prefix}:function(${String(value.length)})`];
  if (Array.isArray(value)) return [`${prefix}:array(${String(value.length)})`];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, child]) => describeShape(child, prefix ? `${prefix}.${key}` : key))
      .sort();
  }
  return [`${prefix}:${typeof value}`];
}

describe('locale definitions', () => {
  it('全ロケールに表示名と html lang が定義されている', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale].length).toBeGreaterThan(0);
      expect(LOCALE_HTML_LANG[locale].length).toBeGreaterThan(0);
    }
  });

  it('isLocale は対応言語だけを受け付ける', () => {
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('zh')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('地域つきタグを前方一致で解決する', () => {
    expect(resolveLocale(['ja-JP'])).toBe('ja');
    expect(resolveLocale(['zh-Hans-CN'])).toBe('zh');
    expect(resolveLocale(['ko-KR'])).toBe('ko');
    expect(resolveLocale(['en-US'])).toBe('en');
    expect(resolveLocale(['fr-FR'])).toBeNull();
    // 対応していない言語は読み飛ばして次を見る
    expect(resolveLocale(['fr-FR', 'en-GB'])).toBe('en');
  });

  it('Accept-Language は品質値の高い順に評価する', () => {
    expect(localeFromAcceptLanguage('fr;q=0.9,ko;q=1.0')).toBe('ko');
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('de')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    // q=0 は「受け入れない」ため無視する
    expect(localeFromAcceptLanguage('ja;q=0,en')).toBe('en');
  });
});

describe('message bundles', () => {
  it('すべての言語が日本語版と同じ構造を持つ', () => {
    const expected = describeShape(ja);
    for (const [name, bundle] of Object.entries(BUNDLES)) {
      expect({ name, shape: describeShape(bundle) }).toEqual({ name, shape: expected });
    }
  });

  it('空文字の翻訳が残っていない', () => {
    const collect = (value: unknown, path: string, out: string[]): void => {
      if (typeof value === 'string') {
        if (value.trim().length === 0) out.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => collect(item, `${path}[${String(index)}]`, out));
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          collect(child, `${path}.${key}`, out);
        }
      }
    };
    for (const [name, bundle] of Object.entries(BUNDLES)) {
      const empty: string[] = [];
      collect(bundle, name, empty);
      expect(empty).toEqual([]);
    }
  });

  it('すべてのエラーコードに全言語の文面がある', () => {
    for (const code of Object.values(ERROR_CODES) as ErrorCode[]) {
      for (const [name, bundle] of Object.entries(BUNDLES)) {
        expect(`${name}:${code}:${bundle.errors[code]}`).not.toContain('undefined');
      }
    }
  });

  it('言語ごとに実際に文面が異なる（コピー漏れがない）', () => {
    // 固有名詞ではない一般的な文言で確認する
    const values = Object.values(BUNDLES).map((bundle) => bundle.common.privacy);
    expect(new Set(values).size).toBe(values.length);
  });

  it('全ティア・全ロールの名前が定義されている', () => {
    for (const [name, bundle] of Object.entries(BUNDLES)) {
      for (const tier of RANK_TIERS) {
        expect(`${name}:${tier}:${bundle.tiers[tier]}`).not.toContain('undefined');
      }
      for (const role of ROLES) {
        expect(`${name}:${role}:${bundle.roles[role]}`).not.toContain('undefined');
      }
    }
  });
});

describe('getMessages / errorMessageFor', () => {
  it('指定した言語の辞書を返す', () => {
    expect(getMessages('en')).toBe(en);
    expect(getMessages('ko')).toBe(ko);
    expect(getMessages(DEFAULT_LOCALE)).toBe(ja);
  });

  it('エラーコードを指定言語で解決する', () => {
    expect(errorMessageFor(ERROR_CODES.ROOM_FULL, en)).toBe(en.errors.ROOM_FULL);
    expect(errorMessageFor(ERROR_CODES.ROOM_FULL)).toBe(ja.errors.ROOM_FULL);
  });
});

describe('validation keys', () => {
  it('Zod はキーを返し、それを訳文へ変換できる', () => {
    const parsed = playerInputSchema.safeParse({
      displayName: '',
      eligibleRoles: [],
      rolePreferenceGroups: [],
      roleRanks: {},
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const keys = formatIssues(parsed.error);
    expect(keys.length).toBeGreaterThan(0);
    // 訳文ではなくキーが返っていること
    for (const key of keys) {
      expect(key).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/u);
    }

    const jaTexts = translateValidationKeys(ja, keys);
    const enTexts = translateValidationKeys(en, keys);
    expect(jaTexts.length).toBeGreaterThan(0);
    expect(jaTexts).not.toEqual(enTexts);
  });

  it('未知のキーは内部名を漏らさず汎用メッセージへ落ちる', () => {
    expect(translateValidationKey(en, 'unknown.key')).toBe(en.errors.VALIDATION_ERROR);
  });
});

describe('localized dynamic messages', () => {
  function player(id: string, index: number): BalancePlayer {
    return {
      id,
      displayName: `player-${id}`,
      eligibleRoles: ['tank'],
      rolePreferenceGroups: [['tank']],
      roleRanks: { tank: 10 + index },
    };
  }

  it('チーム分けの失敗理由が指定言語で返る', () => {
    // 全員 Tank しかできないため Damage/Support が足りず失敗する
    const players = Array.from({ length: REQUIRED_ACTIVE_PLAYERS }, (_, index) =>
      player(`p${String(index)}`, index),
    );

    const jaResult = generateTeamCandidates(players);
    const enResult = generateTeamCandidates(players, en);
    const zhResult = generateTeamCandidates(players, zh);

    expect(jaResult.ok).toBe(false);
    expect(enResult.ok).toBe(false);
    expect(zhResult.ok).toBe(false);
    if (jaResult.ok || enResult.ok || zhResult.ok) return;

    expect(jaResult.reasons).not.toEqual(enResult.reasons);
    expect(enResult.message).toContain('Damage');
    expect(zhResult.message).toContain('输出');
  });

  it('人数不足のメッセージが言語ごとに変わる', () => {
    const tooFew = [player('a', 0)];
    const jaResult = generateTeamCandidates(tooFew);
    const koResult = generateTeamCandidates(tooFew, ko);
    expect(jaResult.ok).toBe(false);
    expect(koResult.ok).toBe(false);
    if (jaResult.ok || koResult.ok) return;
    expect(jaResult.message).toBe(ja.balance.playerCountMismatch(REQUIRED_ACTIVE_PLAYERS, 1));
    expect(koResult.message).toBe(ko.balance.playerCountMismatch(REQUIRED_ACTIVE_PLAYERS, 1));
  });
});

describe('rank / discord formatting', () => {
  it('ディビジョンのあるティアと無いティアを言語ごとに整形する', () => {
    expect(formatRankLocalized(ja, { tier: 'diamond', division: 3 })).toBe('Diamond 3');
    expect(formatRankLocalized(zh, { tier: 'diamond', division: 3 })).toBe('钻石 3');
    expect(formatRankLocalized(ja, { tier: 'champion' })).toBe('Champion');
    expect(formatRankLocalized(ko, { tier: 'champion' })).toBe('챔피언');
  });

  it('Discord 用テキストのロール名が言語に追従する', () => {
    const candidate: TeamCandidate = {
      id: 'c1',
      teamA: {
        players: [
          {
            playerId: 'a',
            displayName: 'Alice',
            role: 'tank',
            rankScore: 20,
            preferenceRank: 1,
            preferencePenalty: 0,
          },
        ],
        totalRank: 20,
      },
      teamB: {
        players: [
          {
            playerId: 'b',
            displayName: 'Bob',
            role: 'tank',
            rankScore: 20,
            preferenceRank: 1,
            preferencePenalty: 0,
          },
        ],
        totalRank: 20,
      },
      score: 0,
      totalRankDiff: 0,
      tankRankDiff: 0,
      damageAvgDiff: 0,
      supportAvgDiff: 0,
      positionalRankDiff: 0,
      preferencePenalty: 0,
    };

    expect(formatDiscordResult(candidate, 'room')).toContain('Tank: Alice');
    expect(formatDiscordResult(candidate, 'room', ko)).toContain('탱커: Alice');
    // TEAM A / TEAM B は貼り付け先の共通目印なので翻訳しない
    expect(formatDiscordResult(candidate, 'room', zh)).toContain('TEAM A');
  });
});
