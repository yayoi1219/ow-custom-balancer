/** English messages. Structure must match ja.ts (enforced by the Messages type). */

import {
  DISPLAY_NAME_MAX_LENGTH,
  MAX_PLAYERS,
  REQUIRED_ACTIVE_PLAYERS,
  ROOM_TITLE_MAX_LENGTH,
} from '../constants';
import type { Messages } from './ja';

export const en: Messages = {
  common: {
    serviceTagline:
      'A tool for Overwatch 2 custom games. Players enter their own role preferences and ranks, and the host builds balanced 5v5 teams.',
    disclaimer:
      'This is an unofficial community tool and is not affiliated with Blizzard Entertainment.',
    privacy: 'Privacy Policy',
    privacyShort: 'Privacy',
    terms: 'Terms of Use',
    backToTop: 'Back to home',
    skipToContent: 'Skip to content',
    siteLinks: 'Site links',
    language: 'Language',
    loading: 'Loading…',
    cancel: 'Cancel',
    required: 'Required',
    reload: 'Reload',
    copy: 'Copy',
    notFoundTitle: 'Page not found',
    notFoundBody: 'Please check the URL.',
  },

  home: {
    titleSuffix: 'Team balancer for Overwatch 2 custom games',
    createRoom: 'Create a room',
    roomName: 'Room name',
    roomNamePlaceholder: 'e.g. Friday customs 10pm',
    roomNameHelp: `Up to ${ROOM_TITLE_MAX_LENGTH} characters. Visible to all players.`,
    createButton: 'Create room',
    creating: 'Creating…',
    preparingTurnstile: 'Preparing the verification widget…',
    howToUse: 'How it works',
    step1: 'Enter a room name and create the room.',
    step2: 'Share the "player URL" in Discord or wherever your group talks.',
    step3: 'Each player registers their name, playable roles, preference order, and per-role rank.',
    step4: `Once up to ${MAX_PLAYERS} players have joined, the host picks the ${REQUIRED_ACTIVE_PLAYERS} playing this round.`,
    step5: 'Press "Generate candidates" to see up to 5 balanced options, then confirm one.',
    step6: "The result appears instantly on everyone's screen and can be copied for Discord.",
    retentionNote: 'Rooms are deleted automatically 24 hours after creation. No account needed.',
    aboutTitle: 'About this tool',
    aboutBody:
      "Following the Overwatch 2 role queue format (1 Tank, 2 Damage, 2 Support), it proposes balanced 5v5 teams from each player's preferred roles and ranks.",
    createFailed: 'Could not create the room.',
    roomNameRequired: 'Please enter a room name.',
    configLoadFailed: 'Could not load settings. Please reload the page.',
  },

  room: {
    recruiting: 'Open',
    closed: 'Closed',
    hostBadge: 'Host',
    playersLabel: 'Players',
    playersValue: (count: number, max: number, active: number) =>
      `${count} / ${max} (${active} active)`,
    expiresAt: 'Expires',
    notFoundTitle: 'Room not found',
    notFoundBody: 'Please check the URL. Rooms are deleted 24 hours after creation.',
    expiredTitle: 'This room has ended',
    expiredBody:
      'It expired or was deleted by the host, so player information and team results have been erased.',
    createNewRoom: 'Create a new room',
    loadFailed: 'Could not load the room.',
    reconnecting: 'Reconnecting. Please wait a moment.',
    offline:
      'You are offline. It will reconnect automatically once your connection returns. Anything you have typed is kept.',
    remainingMinutes: (minutes: number) => `about ${minutes} min left`,
    remainingHours: (hours: number) => `about ${hours} h left`,
    expiredShort: 'Expired',
  },

  connection: {
    connecting: 'Connecting…',
    open: 'Live',
    reconnecting: 'Reconnecting…',
    offline: 'Offline',
  },

  host: {
    menu: 'Host menu',
    participantUrl: 'Player URL',
    participantUrlHelp: 'Share this URL with your players. Do not share the host URL.',
    urlCopied: 'Player URL copied.',
    closeRecruiting: 'Close sign-ups',
    reopenRecruiting: 'Reopen sign-ups',
    generateCandidates: 'Generate candidates',
    captainDraft: 'Captain draft',
    clearSelection: 'Unconfirm teams',
    deleteRoom: 'Delete room',
    activeCountNotice: (required: number, current: number) =>
      `Generating candidates needs exactly ${required} active players (currently ${current}).`,
    selectActiveLabel: (required: number, selected: number) =>
      `Pick the ${required} players for this round (${selected} selected)`,
    applySelection: (required: number) => `Confirm these ${required}`,
    selectActiveHelp: 'Use the checkboxes in the player list below, then press this button.',
    statusOpened: 'Sign-ups are open.',
    statusClosed: 'Sign-ups are closed.',
    activeUpdated: 'Active players updated.',
    candidatesCreated: (count: number) => `Generated ${count} candidate(s).`,
    teamConfirmed: 'Teams confirmed.',
    selectionCleared: 'Teams unconfirmed.',
    playerRemoved: (name: string) => `Removed ${name}.`,
    playerUpdated: (name: string) => `Updated ${name}'s registration.`,
    roomDeleted: 'Room deleted.',
    statusChangeFailed: 'Could not change the sign-up status.',
    activeUpdateFailed: 'Could not update the active players.',
    generateFailed: 'Could not generate candidates.',
    confirmFailed: 'Could not confirm the teams.',
    clearFailed: 'Could not unconfirm the teams.',
    removeFailed: 'Could not remove the player.',
    deleteRoomFailed: 'Could not delete the room.',
    editPlayerFailed: 'Could not update the player.',
  },

  player: {
    myRegistration: 'Your registration',
    editRegistration: 'Edit registration',
    withdraw: 'Withdraw',
    joined: 'You have joined.',
    updated: 'Registration updated.',
    withdrew: 'You have withdrawn.',
    joinFailed: 'Could not register.',
    updateFailed: 'Could not update.',
    withdrawFailed: 'Could not withdraw.',
    roomFullTitle: 'Join',
    roomFullBody: (max: number) => `This room is full (${max} players).`,
    closedBody: 'Sign-ups are currently closed.',
  },

  form: {
    joinTitle: 'Join',
    editTitle: 'Edit your registration',
    hostEditTitle: (name: string) => `Edit ${name}'s registration`,
    hostEditNote: "You are editing this player's registration as the host.",
    displayName: 'Display name',
    displayNameHelp: `Up to ${DISPLAY_NAME_MAX_LENGTH} characters. Must be unique within the room.`,
    eligibleRoles: 'Roles you can play',
    eligibleRolesHelp: 'Set the preference order and rank for each selected role below.',
    preferenceAndRank: 'Preference and rank',
    preferenceHelp:
      'Choosing the same position for two roles means "either is fine". If your rank is unplaced, pick your best guess and tick "Unplaced (estimated)".',
    makeAllSame: 'Make all equal (any role is fine)',
    preferenceNth: (nth: number) => `Choice ${nth}`,
    tiedWith: (roles: string) => ` (tied with ${roles})`,
    noDivision: 'No divisions',
    estimated: 'Unplaced (estimated)',
    adjustmentNote: (experience: string, adjustment: number) =>
      `Unplaced and ${experience}, so the internal rating is adjusted by ${adjustment}.`,
    submitJoin: 'Join',
    submitEdit: 'Save changes',
    submitting: 'Sending…',
    tierLabel: (role: string) => `${role} tier`,
    divisionLabel: (role: string) => `${role} division`,
    experienceLabel: (role: string) => `${role} experience`,
    preferenceRankLabel: (role: string) => `${role} preference`,
    turnstileLabel: 'Verify you are human',
    turnstileLoadFailed:
      'Could not load the verification widget. Check your connection and reload.',
  },

  playerList: {
    title: 'Players',
    empty: 'No players yet. Share the player URL to get started.',
    summary: (count: number, active: number) => `${count} players / ${active} active`,
    selectHint: (required: number) => ` (select ${required})`,
    you: 'You',
    active: 'Playing',
    waiting: 'Standby',
    edit: 'Edit',
    remove: 'Remove',
    includeInDraw: (name: string) => `Include ${name} in this round`,
    anyRole: 'Any role',
    estimatedShort: 'est.',
  },

  teams: {
    confirmedTitle: 'Confirmed teams',
    candidatesTitle: (count: number) => `Candidates (${count})`,
    candidatesHint: 'A lower score means a better-balanced candidate.',
    candidateNth: (nth: number) => `Candidate ${nth}`,
    selectedBadge: 'Confirmed',
    selectThis: 'Confirm this candidate',
    currentlySelected: 'Currently confirmed',
    total: (value: number) => `Total ${value}`,
    preferenceNth: (nth: number) => `Choice ${nth}`,
    outOfPreference: 'Off-preference',
    copyDiscord: 'Copy for Discord',
    copied: 'Copied the Discord text.',
    copyFallback: "If copying doesn't work, use this",
    discordTextLabel: 'Discord text',
    manualAdjust: 'Adjust manually',
    metrics: {
      score: 'Score',
      totalRankDiff: 'Total rank gap',
      tankRankDiff: 'Tank gap',
      damageAvgDiff: 'Damage avg gap',
      supportAvgDiff: 'Support avg gap',
      positionalRankDiff: 'Top-heavy skew',
      preferencePenalty: 'Preference penalty',
    },
  },

  lineup: {
    help: 'Tap (or click) two players in turn to swap them. Swaps into a role a player cannot fill are blocked.',
    diffLabel: 'Change from the original candidate',
    noChange: 'No changes',
    scoreChange: (before: string, after: string) => `Score ${before} → ${after}`,
    save: 'Confirm this lineup',
    reset: 'Reset',
    stop: 'Stop adjusting',
    saved: 'Confirmed the manually adjusted lineup.',
    saveFailed: 'Could not confirm the lineup.',
  },

  draft: {
    title: 'Captain draft',
    inProgress: 'In progress',
    completed: 'Completed',
    completedNotice: 'The draft is complete. See the confirmed teams below.',
    finished: 'The draft has ended.',
    currentTurn: (team: string, name: string) => `On the clock: TEAM ${team} (${name})`,
    yourTurn: "it's your turn",
    remainingPicks: (count: number) => `${count} pick(s) left`,
    captainOf: (name: string) => `Captain: ${name}`,
    captainMark: 'C',
    poolTitle: (count: number) => `Available (${count})`,
    waitingForCaptain: 'Waiting for the captain on the clock. This screen updates automatically.',
    pickAs: (role: string) => `Pick as ${role}`,
    noOpenSlot: 'No open slot for this player.',
    cancelDraft: 'Cancel draft',
    setupHelp: (tank: number, damage: number, support: number) =>
      `Choose two captains and the role each will play. The remaining 8 are picked alternately in A→B→B→A→A→B→B→A order (each team: ${tank} Tank / ${damage} Damage / ${support} Support).`,
    captainFor: (team: string) => `TEAM ${team} captain`,
    captainRoleFor: (team: string) => `Role for the TEAM ${team} captain`,
    start: 'Start draft',
    stop: 'Cancel',
    started: 'Captain draft started.',
    cancelled: 'Draft cancelled.',
    startFailed: 'Could not start the draft.',
    pickFailed: 'Could not make that pick.',
    cancelFailed: 'Could not cancel the draft.',
  },

  dialog: {
    withdrawTitle: 'Withdraw from this room?',
    withdrawBody: 'Your registration will be deleted. You would need to register again to rejoin.',
    withdrawConfirm: 'Withdraw',
    removePlayerTitle: 'Remove this player?',
    removePlayerBody: (name: string) => `This deletes ${name}'s registration.`,
    removeConfirm: 'Remove',
    deleteRoomTitle: 'Delete this room?',
    deleteRoomBody:
      'All player information and confirmed results will be deleted, and the URL will stop working.',
    clearSelectionTitle: 'Unconfirm the teams?',
    clearSelectionBody:
      "The result disappears from everyone's screen. You can pick from the candidates again.",
    clearSelectionConfirm: 'Unconfirm',
    processing: 'Working…',
    defaultConfirm: 'Confirm',
  },

  copy: {
    failed: 'Could not copy. Please select the text and copy it manually.',
    discordRoomName: 'Room',
  },

  experience: {
    main: 'Main (play it regularly)',
    sub: 'Secondary (play it sometimes)',
    rare: 'Rarely (not comfortable)',
    mainShort: 'main',
    subShort: 'sub',
    rareShort: 'rare',
  },

  roles: {
    tank: 'Tank',
    damage: 'Damage',
    support: 'Support',
  },

  tiers: {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    emerald: 'Emerald',
    diamond: 'Diamond',
    master: 'Master',
    grandmaster: 'Grandmaster',
    champion: 'Champion',
  },

  errors: {
    BAD_REQUEST: 'The request was not valid.',
    INVALID_JSON: 'The request format was not valid.',
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported request format.',
    PAYLOAD_TOO_LARGE: 'The submitted data is too large.',
    METHOD_NOT_ALLOWED: 'That operation is not allowed.',
    VALIDATION_ERROR: 'Please check your input.',
    TURNSTILE_REQUIRED: 'Please complete the verification (Turnstile).',
    TURNSTILE_FAILED: 'Verification failed. Please try again.',
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
    UNAUTHORIZED: 'You do not have permission for this action.',
    FORBIDDEN: 'You do not have permission for this action.',
    NOT_FOUND: 'Not found.',
    ROOM_NOT_FOUND: 'Room not found. Please check the URL.',
    ROOM_EXPIRED: 'This room has expired or been deleted.',
    ROOM_CLOSED: 'Sign-ups for this room are closed.',
    ROOM_FULL: 'This room is full.',
    PLAYER_NOT_FOUND: 'Player not found.',
    DUPLICATE_DISPLAY_NAME: 'That display name is already taken. Please choose another.',
    ACTIVE_COUNT_INVALID: `Team generation needs exactly ${REQUIRED_ACTIVE_PLAYERS} active players.`,
    NO_VALID_LINEUP: 'No valid lineup is possible with the current role preferences.',
    CANDIDATE_NOT_FOUND: 'That candidate was not found.',
    CANDIDATES_NOT_GENERATED: 'Generate candidates first.',
    DRAFT_NOT_ACTIVE: 'There is no draft in progress.',
    NOT_YOUR_TURN: 'It is not your turn.',
    CONFIG_ERROR: 'The server is misconfigured. Please contact the administrator.',
    INTERNAL_ERROR: 'A server error occurred. Please try again later.',
    NETWORK_ERROR: 'Connection failed. Please check your network.',
  },

  validation: {
    'displayName.required': 'Please enter a display name.',
    'displayName.tooLong': `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    'displayName.forbiddenChar': 'The display name contains characters that cannot be used.',
    'roomTitle.required': 'Please enter a room name.',
    'roomTitle.tooLong': `Room name must be ${ROOM_TITLE_MAX_LENGTH} characters or fewer.`,
    'roomTitle.forbiddenChar': 'The room name contains characters that cannot be used.',
    'role.required': 'Select at least one role you can play.',
    'role.invalid': 'Invalid role.',
    'role.duplicate': 'Duplicate roles were selected.',
    'rank.divisionRequired': 'Please choose a division.',
    'rank.divisionInvalid': 'Invalid division.',
    'rank.noDivision': 'This tier has no divisions.',
    'rank.missing': 'Enter a rank for each role you can play.',
    'rank.unexpected': 'You cannot set a rank for a role you did not select.',
    'preference.required': 'Please set the preference order.',
    'preference.invalid': 'Invalid preference order.',
    'preference.mismatch': 'The preference order must include each playable role exactly once.',
    'turnstile.required': 'Please complete the verification (Turnstile).',
    'turnstile.invalid': 'Invalid verification token.',
    'activePlayers.tooMany': 'Too many players selected.',
    'activePlayers.duplicate': 'The same player was selected more than once.',
    'activePlayers.limit': `At most ${REQUIRED_ACTIVE_PLAYERS} active players are allowed.`,
    'lineup.size': `A lineup needs ${REQUIRED_ACTIVE_PLAYERS} players.`,
    'id.invalid': 'Invalid ID format.',
  },

  balance: {
    playerCountMismatch: (required: number, current: number) =>
      `Team generation needs exactly ${required} players (currently ${current}).`,
    duplicateId: 'Duplicate player IDs.',
    noEligibleRoles: (name: string) => `${name} has no playable roles set.`,
    duplicateRoles: (name: string) => `${name} has duplicate playable roles.`,
    invalidRank: (name: string, role: string) => `${name}'s ${role} rank is invalid.`,
    preferenceMissing: (name: string, role: string) =>
      `${name}'s preference order does not include ${role}.`,
    roleShortage: (role: string, required: number, current: number) =>
      `You need ${required} players who can play ${role} (currently ${current}).`,
    noValidLineup: 'No valid lineup is possible with the current role preferences.',
    lineupSize: (required: number, current: number) =>
      `A lineup needs ${required} players (currently ${current}).`,
    strangerInLineup: 'The lineup contains someone who is not a player in this room.',
    duplicateInLineup: (name: string) => `${name} appears more than once.`,
    cannotPlayRole: (name: string, role: string) => `${name} cannot play ${role}.`,
    slotCountMismatch: (team: string, role: string, required: number, current: number) =>
      `Team ${team} must have ${required} ${role} (currently ${current}).`,
  },

  draftLogic: {
    captainNotFound: 'The player chosen as captain was not found.',
    captainsMustDiffer: 'Please choose two different captains.',
    captainRoleInfeasible:
      'With those captain roles, the remaining players cannot fill the required slots.',
    alreadyFinished: 'The draft has already ended.',
    playerNotFound: 'The picked player was not found.',
    alreadyPicked: (name: string) => `${name} has already been picked.`,
    slotFull: (team: string, role: string) => `Team ${team}'s ${role} slots are already full.`,
    wouldBreakLineup: (name: string, role: string) =>
      `Picking ${name} as ${role} would make it impossible to fill the remaining slots.`,
    notYourTurn: 'It is not your turn (only the captain on the clock or the host can pick).',
  },

  privacy: {
    title: 'Privacy Policy',
    intro: (service: string) =>
      `This policy explains how ${service} (the "Service") handles personal information.`,
    translationNote:
      'The Japanese version of this document is authoritative. If a translation differs from it, the Japanese version prevails.',
    s1Title: '1. Information we store',
    s1Items: [
      'The display name a player enters',
      'Playable roles and their preference order',
      'Current or estimated rank per role, whether it is unplaced, and self-reported experience',
      'Room name, creation time, expiry, sign-up status, and the confirmed team composition',
    ],
    s1Body:
      'This data is stored in the SQLite storage of a Cloudflare Durable Object allocated per room.',
    s2Title: '2. No account registration',
    s2Body:
      'The Service has no account system and does not collect email addresses, phone numbers, or social accounts. Display names are intended to be nicknames of your choosing. Please do not enter information such as your real name that you would not want shared.',
    s3Title: '3. Data retention',
    s3Body:
      'Room data is deleted automatically 24 hours after creation. On deletion, player information (display name, roles, ranks), hashed authorization tokens, and confirmed team results are erased. The same applies when the host deletes the room manually.',
    s4Title: '4. Authorization tokens and browser storage',
    s4Body1:
      "The Service issues random authorization tokens to identify the host and each player. Tokens are stored in your browser's localStorage, separated per room. The server never stores the tokens themselves — only an HMAC-SHA-256 hash computed with a secret key.",
    s4Body2:
      'Clearing your browser data also clears the tokens, which may prevent you from using host controls or editing your own registration.',
    s5Title: '5. Handling of IP addresses',
    s5Body:
      'Rate limiting is applied to prevent abuse. IP addresses themselves are never stored; only an irreversible identifier derived via HMAC from a secret key combined with a time window is kept, and only briefly (about one hour at most). The identifier changes over time and the original IP address cannot be recovered from it.',
    s6Title: '6. Use of Cloudflare Turnstile',
    s6Body:
      "Cloudflare Turnstile is used when creating a room and when registering as a new player, to prevent automated access. Doing so may transmit connection information to Cloudflare. See Cloudflare's privacy policy for details.",
    s7Title: '7. Data sent to external services',
    s7Body:
      "The Service never retrieves player ranks or play history from external services. There is no official API for Overwatch 2 ranks, and unofficial retrieval methods are prohibited by Blizzard's terms. Information you enter is not sent outside the Service (other than Turnstile).",
    s8Title: '8. Analytics and advertising',
    s8Body:
      'This initial version uses no analytics tools and no advertising trackers. We do not provide or sell data to third parties.',
    s9Title: '9. Contact and changes',
    s9Body:
      'This policy may change without notice as features are added or laws change. Any updated version will be published on this page.',
  },

  terms: {
    title: 'Terms of Use',
    intro: (service: string) =>
      `These terms govern the use of ${service} (the "Service"). By using the Service you are deemed to have agreed to them.`,
    s1Title: '1. Unofficial service',
    s1Body:
      'The Service is an unofficial community tool made by volunteers. It uses no official Overwatch or Blizzard Entertainment assets, logos, or images. Wording may not match the game exactly after in-game changes.',
    s2Title: '2. No warranty',
    s2Body:
      'The Service is provided as is, with no warranty as to completeness, accuracy, or availability. Team results are a suggestion only and fairness is not guaranteed. The operator accepts no liability for damages arising from use or inability to use the Service.',
    s3Title: '3. Prohibited conduct',
    s3Items: [
      'Display names that harass, impersonate, or defame other users',
      'Deliberately registering false rank or role information to disrupt games',
      'Excessive access via automated tools, or circumventing rate limits',
      'Exploiting vulnerabilities, or unauthorized access through reverse engineering',
      'Any conduct that violates laws or public order and morals',
    ],
    s4Title: '4. Responsibility for rooms',
    s4Body:
      "Managing a room (selecting and removing players, opening and closing sign-ups, confirming teams, deleting the room) is the responsibility of the host who created it. Safeguarding the host URL is also the host's responsibility; do not share it with third parties. The operator is not involved in how individual rooms are run.",
    s5Title: '5. Changes and suspension',
    s5Body:
      'The operator may change, suspend, or discontinue the Service without notice, and accepts no liability for damages arising from doing so.',
    s6Title: '6. Data deletion',
    s6Body:
      'Room data is deleted 24 hours after creation. Please save any results you need before then.',
  },
};
