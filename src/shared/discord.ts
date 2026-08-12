/** 確定チームを Discord へ貼り付けやすいテキストへ整形する。 */

import { ROLE_LABELS, type Role } from './constants';
import type { TeamCandidate, TeamComposition } from './types';

const TEAM_A_MARK = '🔵';
const TEAM_B_MARK = '🔴';

function roleLine(team: TeamComposition, role: Role): string {
  const names = team.players
    .filter((player) => player.role === role)
    .map((player) => player.displayName)
    .join(' / ');
  return `${ROLE_LABELS[role]}: ${names}`;
}

function teamBlock(mark: string, label: string, team: TeamComposition): string {
  return [
    `${mark} ${label}`,
    roleLine(team, 'tank'),
    roleLine(team, 'damage'),
    roleLine(team, 'support'),
  ].join('\n');
}

/** Discord へ貼り付ける結果テキストを生成する */
export function formatDiscordResult(candidate: TeamCandidate, roomTitle: string): string {
  return [
    teamBlock(TEAM_A_MARK, 'TEAM A', candidate.teamA),
    '',
    teamBlock(TEAM_B_MARK, 'TEAM B', candidate.teamB),
    '',
    `部屋名: ${roomTitle}`,
    '',
  ].join('\n');
}
