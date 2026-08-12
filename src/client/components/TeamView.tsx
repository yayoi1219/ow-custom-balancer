/** チーム候補と確定チームの表示。 */

import {
  ROLES,
  ROLE_EXPERIENCE_SHORT_LABELS,
  ROLE_LABELS,
  type Role,
} from '../../shared/constants';
import { formatRankScore, scoreToRank } from '../../shared/ranks';
import type { TeamCandidate, TeamComposition } from '../../shared/types';
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
  return (
    <div className={`team-block team-${side}`}>
      <div className="team-heading">
        <span className="team-mark" aria-hidden="true">
          {side === 'a' ? '🔵' : '🔴'}
        </span>
        <h4>{label}</h4>
        <span className="team-total">合計 {team.totalRank}</span>
      </div>
      <ul className="team-members">
        {ROLES.map((role: Role) =>
          team.players
            .filter((player) => player.role === role)
            .map((player) => (
              <li key={player.playerId} className="team-member">
                <span className="role-badge">{ROLE_LABELS[role]}</span>
                <span className="team-member-name">{player.displayName}</span>
                {/* ランクはティア色で表示する */}
                <span className={`team-member-rank tier-${scoreToRank(player.rankScore).tier}`}>
                  {formatRankScore(player.rankScore)}
                  {player.rankEstimated ? (
                    <span className="rank-estimated-mark">（推定）</span>
                  ) : null}
                  {player.experience && player.experience !== 'main' ? (
                    <span className="rank-estimated-mark">
                      /{ROLE_EXPERIENCE_SHORT_LABELS[player.experience]}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`pref-badge${player.preferenceRank === 1 ? ' pref-first' : ''}`}
                  title="希望順位"
                >
                  {player.preferenceRank > 0 ? `第${player.preferenceRank}希望` : '希望外'}
                </span>
              </li>
            )),
        )}
      </ul>
    </div>
  );
}

export function CandidateMetrics({ candidate }: { candidate: TeamCandidate }) {
  return (
    <dl className="metrics">
      <div>
        <dt>総合スコア</dt>
        <dd>{formatNumber(candidate.score)}</dd>
      </div>
      <div>
        <dt>総合ランク差</dt>
        <dd>{formatNumber(candidate.totalRankDiff)}</dd>
      </div>
      <div>
        <dt>Tank差</dt>
        <dd>{formatNumber(candidate.tankRankDiff)}</dd>
      </div>
      <div>
        <dt>Damage平均差</dt>
        <dd>{formatNumber(candidate.damageAvgDiff)}</dd>
      </div>
      <div>
        <dt>Support平均差</dt>
        <dd>{formatNumber(candidate.supportAvgDiff)}</dd>
      </div>
      <div>
        <dt>上位者の偏り</dt>
        <dd>{formatNumber(candidate.positionalRankDiff)}</dd>
      </div>
      <div>
        <dt>希望ペナルティ</dt>
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
  return (
    <article className={`candidate-card${selected ? ' is-selected' : ''}`}>
      <header className="candidate-header">
        <h3>候補 {index + 1}</h3>
        {selected ? <span className="badge badge-selected">確定中</span> : null}
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
          {selected ? 'この候補で確定中' : 'この候補で確定する'}
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
