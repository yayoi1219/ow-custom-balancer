/** 参加登録・編集フォーム。 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DISPLAY_NAME_MAX_LENGTH,
  EXPERIENCE_ADJUSTMENT,
  ROLES,
  ROLE_EXPERIENCES,
  type Role,
  type RoleExperience,
} from '../../shared/constants';
import type { Messages } from '../../shared/i18n';
import {
  buildPreferenceGroups,
  preferenceRankMap,
  type PreferenceGroups,
} from '../../shared/preferences';
import {
  RANK_DIVISIONS,
  RANK_TIERS,
  tierHasDivisions,
  type RankTier,
  type RankValue,
} from '../../shared/ranks';
import type { PlayerInput, RoleRanks } from '../../shared/types';
import { useMessages } from '../hooks/useI18n';
import { clearDraft, loadDraft, saveDraft } from '../lib/storage';
import { Turnstile } from './Turnstile';

export interface PlayerFormDraft {
  displayName: string;
  /** 選択したロール（表示順の保持用） */
  selectedRoles: Role[];
  /** ロールごとに利用者が付けた希望順位。同じ値なら「どちらでもよい」。 */
  preferenceRanks: Partial<Record<Role, number>>;
  roleRanks: RoleRanks;
}

/** プレイ歴の短縮表記を辞書から引く */
function experienceShortLabel(messages: Messages, experience: RoleExperience): string {
  if (experience === 'main') return messages.experience.mainShort;
  if (experience === 'sub') return messages.experience.subShort;
  return messages.experience.rareShort;
}

const DEFAULT_DIVISION = 3;
const DEFAULT_RANK: RankValue = { tier: 'gold', division: DEFAULT_DIVISION };

function emptyDraft(): PlayerFormDraft {
  return { displayName: '', selectedRoles: [], preferenceRanks: {}, roleRanks: {} };
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function sanitizeDraft(draft: PlayerFormDraft | null): PlayerFormDraft {
  if (!draft) return emptyDraft();
  const selectedRoles = Array.isArray(draft.selectedRoles)
    ? [...new Set(draft.selectedRoles.filter(isRole))]
    : [];
  const preferenceRanks: Partial<Record<Role, number>> = {};
  if (typeof draft.preferenceRanks === 'object' && draft.preferenceRanks !== null) {
    for (const role of selectedRoles) {
      const value = draft.preferenceRanks[role];
      if (typeof value === 'number' && value >= 1 && value <= ROLES.length) {
        preferenceRanks[role] = value;
      }
    }
  }
  return {
    displayName: typeof draft.displayName === 'string' ? draft.displayName : '',
    selectedRoles,
    preferenceRanks,
    roleRanks:
      typeof draft.roleRanks === 'object' && draft.roleRanks !== null ? draft.roleRanks : {},
  };
}

/** 希望順位グループから、フォーム編集用の「ロール→順位」表へ戻す */
function draftFromGroups(groups: PreferenceGroups): {
  selectedRoles: Role[];
  preferenceRanks: Partial<Record<Role, number>>;
} {
  const preferenceRanks = preferenceRankMap(groups);
  return { selectedRoles: groups.flat(), preferenceRanks };
}

interface RankFieldProps {
  role: Role;
  value: RankValue | undefined;
  onChange: (rank: RankValue) => void;
  disabled?: boolean;
  messages: Messages;
}

function RankField({ role, value, onChange, disabled, messages }: RankFieldProps) {
  const current = value ?? DEFAULT_RANK;
  const roleName = messages.roles[role];
  const hasDivisions = tierHasDivisions(current.tier);
  const tierId = `rank-tier-${role}`;
  const divisionId = `rank-division-${role}`;
  const experienceId = `rank-experience-${role}`;

  /** ティア変更時に、ディビジョンの有無へ合わせて値を整える */
  const changeTier = (tier: RankTier): void => {
    const next: RankValue = { ...current, tier };
    if (tierHasDivisions(tier)) {
      next.division = current.division ?? DEFAULT_DIVISION;
    } else {
      delete next.division;
    }
    onChange(next);
  };
  return (
    /* 選択中のティア色を左端のラインで示す */
    <div className={`rank-field tier-${current.tier}`}>
      <div className="rank-field-row">
        <label className="visually-hidden" htmlFor={tierId}>
          {messages.form.tierLabel(roleName)}
        </label>
        <select
          id={tierId}
          value={current.tier}
          disabled={disabled}
          onChange={(event) => changeTier(event.target.value as RankTier)}
        >
          {RANK_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {messages.tiers[tier]}
            </option>
          ))}
        </select>
        {/* Champion はディビジョンを持たないため選択欄を出さない */}
        {hasDivisions ? (
          <>
            <label className="visually-hidden" htmlFor={divisionId}>
              {messages.form.divisionLabel(roleName)}
            </label>
            <select
              id={divisionId}
              value={current.division ?? DEFAULT_DIVISION}
              disabled={disabled}
              onChange={(event) => onChange({ ...current, division: Number(event.target.value) })}
            >
              {RANK_DIVISIONS.map((division) => (
                <option key={division} value={division}>
                  {division}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="rank-no-division">{messages.form.noDivision}</span>
        )}
      </div>
      <div className="rank-field-extra">
        {/* 未計測の人は「だいたいこのくらい」を選び、推定であることを申告できる */}
        <label className="estimated-toggle">
          <input
            type="checkbox"
            checked={current.estimated === true}
            disabled={disabled}
            onChange={(event) => onChange({ ...current, estimated: event.target.checked })}
          />
          <span>{messages.form.estimated}</span>
        </label>
        <label className="experience-select" htmlFor={experienceId}>
          <span className="visually-hidden">{messages.form.experienceLabel(roleName)}</span>
          <select
            id={experienceId}
            value={current.experience ?? 'main'}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...current, experience: event.target.value as RoleExperience })
            }
          >
            {ROLE_EXPERIENCES.map((experience) => (
              <option key={experience} value={experience}>
                {messages.experience[experience]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {current.estimated === true && (current.experience ?? 'main') !== 'main' ? (
        <p className="rank-field-note">
          {messages.form.adjustmentNote(
            experienceShortLabel(messages, current.experience ?? 'main'),
            EXPERIENCE_ADJUSTMENT[current.experience ?? 'main'],
          )}
        </p>
      ) : null}
    </div>
  );
}

export interface PlayerFormProps {
  mode: 'create' | 'edit';
  roomId: string;
  initialValue?: PlayerInput;
  submitting: boolean;
  disabled?: boolean;
  errorMessage: string | null;
  errorDetails?: string[];
  /** 新規登録時のみ Turnstile を表示する */
  turnstileSiteKey?: string | null;
  /** 主催者が他の参加者を修正する場合の対象名 */
  subjectName?: string | null;
  onSubmit: (input: PlayerInput, turnstileToken: string | null) => void;
  onCancel?: () => void;
}

export function PlayerForm({
  mode,
  roomId,
  initialValue,
  submitting,
  disabled = false,
  errorMessage,
  errorDetails,
  turnstileSiteKey,
  subjectName,
  onSubmit,
  onCancel,
}: PlayerFormProps) {
  const messages = useMessages();
  const initialDraft = useMemo<PlayerFormDraft>(() => {
    if (initialValue) {
      const { selectedRoles, preferenceRanks } = draftFromGroups(initialValue.rolePreferenceGroups);
      return {
        displayName: initialValue.displayName,
        selectedRoles,
        preferenceRanks,
        roleRanks: initialValue.roleRanks,
      };
    }
    return sanitizeDraft(loadDraft<PlayerFormDraft>(roomId));
  }, [initialValue, roomId]);

  const [displayName, setDisplayName] = useState(initialDraft.displayName);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(initialDraft.selectedRoles);
  const [preferenceRanks, setPreferenceRanks] = useState<Partial<Record<Role, number>>>(
    initialDraft.preferenceRanks,
  );
  const [roleRanks, setRoleRanks] = useState<RoleRanks>(initialDraft.roleRanks);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  // 選択したロールを、利用者が付けた順位でまとめた実際の希望グループ
  const groups = useMemo(
    () => buildPreferenceGroups(preferenceRanks, selectedRoles),
    [preferenceRanks, selectedRoles],
  );
  const effectiveRank = useMemo(() => preferenceRankMap(groups), [groups]);

  // 通信が切れても入力を失わないよう、新規登録時は下書きを保存する
  useEffect(() => {
    if (mode !== 'create') return;
    saveDraft<PlayerFormDraft>(roomId, { displayName, selectedRoles, preferenceRanks, roleRanks });
  }, [mode, roomId, displayName, selectedRoles, preferenceRanks, roleRanks]);

  // 送信に失敗したら Turnstile トークンは使い回さず取り直す
  useEffect(() => {
    if (errorMessage && mode === 'create') {
      setTurnstileToken(null);
      setTurnstileResetKey((key) => key + 1);
    }
  }, [errorMessage, mode]);

  const toggleRole = (role: Role): void => {
    const wasSelected = selectedRoles.includes(role);
    setSelectedRoles((current) =>
      wasSelected ? current.filter((item) => item !== role) : [...current, role],
    );
    setPreferenceRanks((current) => {
      const next = { ...current };
      if (wasSelected) {
        delete next[role];
      } else {
        // 追加したロールは、いちばん下の希望として扱う
        next[role] = Math.min(ROLES.length, selectedRoles.length + 1);
      }
      return next;
    });
    setRoleRanks((current) => {
      const next = { ...current };
      if (wasSelected) {
        delete next[role];
      } else if (!next[role]) {
        next[role] = DEFAULT_RANK;
      }
      return next;
    });
  };

  /** すべて同順位（どれでもよい）にする */
  const setAllSameRank = (): void => {
    setPreferenceRanks(() => {
      const next: Partial<Record<Role, number>> = {};
      for (const role of selectedRoles) next[role] = 1;
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setLocalError(null);

    if (displayName.trim().length === 0) {
      setLocalError(messages.validation['displayName.required']);
      return;
    }
    if (selectedRoles.length === 0) {
      setLocalError(messages.validation['role.required']);
      return;
    }
    for (const role of selectedRoles) {
      if (!roleRanks[role]) {
        setLocalError(messages.validation['rank.missing']);
        return;
      }
    }
    if (mode === 'create' && turnstileSiteKey && !turnstileToken) {
      setLocalError(messages.errors.TURNSTILE_REQUIRED);
      return;
    }

    const ranks: RoleRanks = {};
    for (const role of selectedRoles) {
      ranks[role] = roleRanks[role];
    }

    const input: PlayerInput = {
      displayName,
      eligibleRoles: [...selectedRoles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)),
      rolePreferenceGroups: groups,
      roleRanks: ranks,
    };
    onSubmit(input, turnstileToken);
  };

  const combinedError = localError ?? errorMessage;
  // 順位の選択肢は「選んだロールの数」まで
  const rankOptions = Array.from({ length: selectedRoles.length }, (_, index) => index + 1);
  const allSameRank = groups.length === 1 && selectedRoles.length > 1;

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h2>
        {mode === 'create'
          ? messages.form.joinTitle
          : subjectName
            ? messages.form.hostEditTitle(subjectName)
            : messages.form.editTitle}
      </h2>
      {subjectName ? <p className="field-help">{messages.form.hostEditNote}</p> : null}

      <div className="field">
        <label htmlFor="display-name">
          {messages.form.displayName} <span className="required">{messages.common.required}</span>
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
          autoComplete="off"
          disabled={disabled || submitting}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-describedby="display-name-help"
        />
        <p className="field-help" id="display-name-help">
          {messages.form.displayNameHelp}
        </p>
      </div>

      <fieldset className="field">
        <legend>
          {messages.form.eligibleRoles} <span className="required">{messages.common.required}</span>
        </legend>
        <div className="role-checkboxes">
          {ROLES.map((role) => {
            const checked = selectedRoles.includes(role);
            return (
              <label key={role} className={`role-checkbox${checked ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || submitting}
                  onChange={() => toggleRole(role)}
                />
                <span>{messages.roles[role]}</span>
              </label>
            );
          })}
        </div>
        <p className="field-help">{messages.form.eligibleRolesHelp}</p>
      </fieldset>

      {selectedRoles.length > 0 ? (
        <div className="field">
          <p className="field-label">{messages.form.preferenceAndRank}</p>
          <p className="field-help">
            {messages.form.preferenceHelp}
            {selectedRoles.length > 1 ? (
              <>
                {' '}
                <button
                  type="button"
                  className="button button-small button-ghost"
                  onClick={setAllSameRank}
                  disabled={disabled || submitting || allSameRank}
                >
                  {messages.form.makeAllSame}
                </button>
              </>
            ) : null}
          </p>
          <ul className="preference-list">
            {selectedRoles.map((role) => {
              const selectId = `preference-rank-${role}`;
              const rank = effectiveRank[role] ?? 1;
              const sameRankPartners = (groups[rank - 1] ?? []).filter((item) => item !== role);
              return (
                <li key={role} className="preference-item">
                  <div className="preference-head">
                    <span className="role-badge">{messages.roles[role]}</span>
                    <label className="preference-select" htmlFor={selectId}>
                      <span className="visually-hidden">
                        {messages.form.preferenceRankLabel(messages.roles[role])}
                      </span>
                      <select
                        id={selectId}
                        value={preferenceRanks[role] ?? 1}
                        disabled={disabled || submitting}
                        onChange={(event) =>
                          setPreferenceRanks((current) => ({
                            ...current,
                            [role]: Number(event.target.value),
                          }))
                        }
                      >
                        {rankOptions.map((option) => (
                          <option key={option} value={option}>
                            {messages.form.preferenceNth(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="preference-effective">
                      {messages.form.preferenceNth(rank)}
                      {sameRankPartners.length > 0
                        ? messages.form.tiedWith(
                            sameRankPartners.map((item) => messages.roles[item]).join(' / '),
                          )
                        : ''}
                    </span>
                  </div>
                  <RankField
                    role={role}
                    value={roleRanks[role]}
                    disabled={disabled || submitting}
                    onChange={(rank) => setRoleRanks((current) => ({ ...current, [role]: rank }))}
                    messages={messages}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mode === 'create' && turnstileSiteKey ? (
        <div className="field">
          <Turnstile
            siteKey={turnstileSiteKey}
            action="join-room"
            resetKey={turnstileResetKey}
            onToken={setTurnstileToken}
          />
        </div>
      ) : null}

      {combinedError ? (
        <p className="field-error" role="alert">
          {combinedError}
          {errorDetails && errorDetails.length > 1 ? (
            <span className="field-error-details">{errorDetails.slice(1).join(' / ')}</span>
          ) : null}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={disabled || submitting}>
          {submitting
            ? messages.form.submitting
            : mode === 'create'
              ? messages.form.submitJoin
              : messages.form.submitEdit}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              clearDraft(roomId);
              onCancel();
            }}
            disabled={submitting}
          >
            {messages.common.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
