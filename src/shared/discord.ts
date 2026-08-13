/** 確定チームを Discord へ貼り付けやすいテキストへ整形する。 */

import type { Role } from './constants';
import { ja, type Messages } from './i18n/ja';
import type { TeamCandidate, TeamComposition } from './types';

const TEAM_A_MARK = '🔵';
const TEAM_B_MARK = '🔴';

function roleLine(team: TeamComposition, role: Role, messages: Messages): string {
  const names = team.players
    .filter((player) => player.role === role)
    .map((player) => player.displayName)
    .join(' / ');
  return `${messages.roles[role]}: ${names}`;
}

function teamBlock(mark: string, label: string, team: TeamComposition, messages: Messages): string {
  return [
    `${mark} ${label}`,
    roleLine(team, 'tank', messages),
    roleLine(team, 'damage', messages),
    roleLine(team, 'support', messages),
  ].join('\n');
}

/**
 * Discord へ貼り付ける結果テキストを生成する。
 * TEAM A / TEAM B は貼り付け先で共通の目印になるため翻訳しない。
 */
export function formatDiscordResult(
  candidate: TeamCandidate,
  roomTitle: string,
  messages: Messages = ja,
): string {
  return [
    teamBlock(TEAM_A_MARK, 'TEAM A', candidate.teamA, messages),
    '',
    teamBlock(TEAM_B_MARK, 'TEAM B', candidate.teamB, messages),
    '',
    `${messages.copy.discordRoomName}: ${roomTitle}`,
    '',
  ].join('\n');
}
