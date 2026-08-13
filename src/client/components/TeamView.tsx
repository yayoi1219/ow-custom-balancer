/** チーム候補と確定チームの表示。 */

import { ROLES, type Role } from '../../shared/constants';
import { formatRankLocalized } from '../../shared/i18n';
import { scoreToRank } from '../../shared/ranks';
import type { TeamCandidate, TeamComposition } from '../../shared/types';
import { useMessages } from '../hooks/useI18n';
import { formatNumber } from '../lib/format';

function TeamBlock({
  label,
  side,
  team,
}: {
  label: string;
  side: 'a' | 'b';
  team: TeamComposition;
}) {
  const messages = useMessages();
  return (
    <div className={`team-block team-${side}`}>
      <div className="team-heading">
        <span className="team-mark" aria-hidden="true">
          {side === 'a' ? '🔵' : '🔴'}
        </span>
        <h4>{label}</h4>
        <span className="team-total">{messages.teams.total(team.totalRank)}</span>
      </div>
      <ul className="team-members">
        {ROLES.map((role: Role) =>
          team.players
            .filter((player) => player.role === role)
            .map((player) => (
              <li key={player.playerId} className="team-member">
                <span className="role-badge">{messages.roles[role]}</span>
                <span className="team-member-name">{player.displayName}</span>
                {/* ランクはティア色で表示する */}
                <span className={`team-member-rank tier-${scoreToRank(player.rankScore).tier}`}>
                  {formatRankLocalized(messages, scoreToRank(player.rankScore))}
                  {player.rankEstimated ? (
                    <span className="rank-estimated-mark">
                      ({messages.playerList.estimatedShort})
                    </span>
                  ) : null}
                  {player.experience && player.experience !== 'main' ? (
                    <span className="rank-estimated-mark">
                      /
                      {player.experience === 'sub'
                        ? messages.experience.subShort
                        : messages.experience.rareShort}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`pref-badge${player.preferenceRank === 1 ? ' pref-first' : ''}`}
                  title={messages.form.preferenceAndRank}
                >
                  {player.preferenceRank > 0
                    ? messages.teams.preferenceNth(player.preferenceRank)
                    : messages.teams.outOfPreference}
                </span>
              </li>
            )),
        )}
      </ul>
    </div>
  );
}

export function CandidateMetrics({ candidate }: { candidate: TeamCandidate }) {
  const t = useMessages().teams.metrics;
  return (
    <dl className="metrics">
      <div>
        <dt>{t.score}</dt>
        <dd>{formatNumber(candidate.score)}</dd>
      </div>
      <div>
        <dt>{t.totalRankDiff}</dt>
        <dd>{formatNumber(candidate.totalRankDiff)}</dd>
      </div>
      <div>
        <dt>{t.tankRankDiff}</dt>
        <dd>{formatNumber(candidate.tankRankDiff)}</dd>
      </div>
      <div>
        <dt>{t.damageAvgDiff}</dt>
        <dd>{formatNumber(candidate.damageAvgDiff)}</dd>
      </div>
      <div>
        <dt>{t.supportAvgDiff}</dt>
        <dd>{formatNumber(candidate.supportAvgDiff)}</dd>
      </div>
      <div>
        <dt>{t.positionalRankDiff}</dt>
        <dd>{formatNumber(candidate.positionalRankDiff)}</dd>
      </div>
      <div>
        <dt>{t.preferencePenalty}</dt>
        <dd>{formatNumber(candidate.preferencePenalty)}</dd>
      </div>
    </dl>
  );
}

export function TeamCandidateCard({
  candidate,
  index,
  selected,
  onSelect,
  busy,
}: {
  candidate: TeamCandidate;
  index: number;
  selected: boolean;
  onSelect?: (candidate: TeamCandidate) => void;
  busy?: boolean;
}) {
  const messages = useMessages();
  return (
    <article className={`candidate-card${selected ? ' is-selected' : ''}`}>
      <header className="candidate-header">
        <h3>{messages.teams.candidateNth(index + 1)}</h3>
        {selected ? (
          <span className="badge badge-selected">{messages.teams.selectedBadge}</span>
        ) : null}
      </header>
      <CandidateMetrics candidate={candidate} />
      <div className="teams">
        <TeamBlock label="TEAM A" side="a" team={candidate.teamA} />
        <TeamBlock label="TEAM B" side="b" team={candidate.teamB} />
      </div>
      {onSelect ? (
        <button
          type="button"
          className="button button-primary"
          onClick={() => onSelect(candidate)}
          disabled={busy}
        >
          {selected ? messages.teams.currentlySelected : messages.teams.selectThis}
        </button>
      ) : null}
    </article>
  );
}

export function SelectedTeams({ candidate }: { candidate: TeamCandidate }) {
  return (
    <div className="teams">
      <TeamBlock label="TEAM A" side="a" team={candidate.teamA} />
      <TeamBlock label="TEAM B" side="b" team={candidate.teamB} />
    </div>
  );
}
