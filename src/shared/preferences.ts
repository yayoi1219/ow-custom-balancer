/**
 * ロールの希望順位。
 *
 * 同じグループに入っているロールは「同順位（どちらでもよい）」を意味する。
 *   [['tank'], ['damage'], ['support']]        … Tank が第1希望、Damage が第2希望、Support が第3希望
 *   [['tank', 'support'], ['damage']]          … Tank / Support はどちらでもよく、Damage は第2希望
 *   [['tank', 'damage', 'support']]            … どれでもよい
 */

import { ROLES, type Role } from './constants';

export type PreferenceGroups = Role[][];

/** グループ内をロールの正規順で整列し、空グループを取り除く */
export function normalizePreferenceGroups(groups: PreferenceGroups): PreferenceGroups {
  return groups
    .map((group) => [...new Set(group)].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)))
    .filter((group) => group.length > 0);
}

/** グループを平坦化した並び（表示や既存処理との互換用） */
export function flattenPreferenceGroups(groups: PreferenceGroups): Role[] {
  return groups.flat();
}

/** そのロールが第何希望か（0始まり）。含まれない場合は -1。 */
export function preferenceIndexOf(groups: PreferenceGroups, role: Role): number {
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index].includes(role)) return index;
  }
  return -1;
}

/**
 * 利用者が各ロールへ個別に付けた順位（1〜3、重複可・飛び番可）から、
 * 連続した希望グループを作る。
 *   { tank: 1, support: 1, damage: 3 } → [['tank','support'], ['damage']]
 */
export function buildPreferenceGroups(
  ranks: Partial<Record<Role, number>>,
  eligibleRoles: Role[],
): PreferenceGroups {
  const entries = eligibleRoles.map((role) => ({ role, rank: ranks[role] ?? 1 }));
  const distinctRanks = [...new Set(entries.map((entry) => entry.rank))].sort((a, b) => a - b);
  return normalizePreferenceGroups(
    distinctRanks.map((rank) =>
      entries.filter((entry) => entry.rank === rank).map((entry) => entry.role),
    ),
  );
}

/** グループから各ロールの順位（1始まり）を引ける形へ変換する */
export function preferenceRankMap(groups: PreferenceGroups): Partial<Record<Role, number>> {
  const map: Partial<Record<Role, number>> = {};
  groups.forEach((group, index) => {
    for (const role of group) map[role] = index + 1;
  });
  return map;
}
