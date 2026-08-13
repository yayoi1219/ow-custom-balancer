/**
 * 日本語メッセージ（正本）。
 *
 * このファイルの構造が Messages 型になる。他の言語はこの型に適合する必要があり、
 * キーの過不足は型チェックで検出される。
 */

import {
  DISPLAY_NAME_MAX_LENGTH,
  MAX_PLAYERS,
  REQUIRED_ACTIVE_PLAYERS,
  ROOM_TITLE_MAX_LENGTH,
} from '../constants';
import type { ErrorCode } from '../errors';

export const ja = {
  common: {
    serviceTagline:
      'Overwatch 2 のカスタムゲーム向けに、参加者のロール希望とランクを集めてバランスのよい 5vs5 を作るツールです。',
    disclaimer:
      '本サービスは非公式のコミュニティツールであり、Blizzard Entertainment とは関係ありません。',
    privacy: 'プライバシーポリシー',
    privacyShort: 'プライバシー',
    terms: '利用規約',
    backToTop: 'トップページへ戻る',
    skipToContent: '本文へスキップ',
    siteLinks: 'サイト内リンク',
    language: '言語',
    loading: '読み込み中…',
    cancel: 'キャンセル',
    required: '必須',
    reload: '再読み込み',
    copy: 'コピー',
    notFoundTitle: 'ページが見つかりません',
    notFoundBody: 'URL をご確認ください。',
  },

  home: {
    titleSuffix: 'Overwatch 2 カスタム用チーム分け',
    createRoom: 'カスタム部屋を作る',
    roomName: '部屋名',
    roomNamePlaceholder: '例: 金曜カスタム 22時',
    roomNameHelp: `${ROOM_TITLE_MAX_LENGTH}文字以内。参加者にも表示されます。`,
    createButton: '部屋を作成する',
    creating: '作成中…',
    preparingTurnstile: '認証ウィジェットを準備しています…',
    howToUse: '使い方',
    step1: '部屋名を入力して部屋を作成します。',
    step2: '発行された「参加者用URL」を Discord などに貼ります。',
    step3: '参加者は名前・担当できるロール・希望順位・ロール別ランクを登録します。',
    step4: `参加者が${MAX_PLAYERS}人まで集まったら、主催者が今回参加する${REQUIRED_ACTIVE_PLAYERS}人を選びます。`,
    step5: '「チーム候補を作成」でバランス案を最大5件表示し、1つを確定します。',
    step6: '確定結果は全員の画面へ即時反映され、Discord用テキストとしてコピーできます。',
    retentionNote: '部屋は作成から24時間で自動的に削除されます。アカウント登録は不要です。',
    aboutTitle: 'このサービスについて',
    aboutBody:
      'Overwatch 2 のロールキュー構成（Tank×1・Damage×2・Support×2）に沿って、参加者の希望ロールとランクからバランスのよい 5vs5 を提案します。',
    createFailed: '部屋の作成に失敗しました。',
    roomNameRequired: '部屋名を入力してください。',
    configLoadFailed: '設定の取得に失敗しました。ページを再読み込みしてください。',
  },

  room: {
    recruiting: '募集中',
    closed: '募集締切',
    hostBadge: '主催者',
    playersLabel: '参加者',
    playersValue: (count: number, max: number, active: number) =>
      `${count} / ${max}人（アクティブ ${active}人）`,
    expiresAt: '有効期限',
    notFoundTitle: '部屋が見つかりません',
    notFoundBody: 'URL が正しいか確認してください。部屋は作成から24時間で削除されます。',
    expiredTitle: 'この部屋は終了しました',
    expiredBody:
      '有効期限切れ、または主催者によって削除されたため、参加者情報とチーム結果は削除されました。',
    createNewRoom: '新しい部屋を作る',
    loadFailed: '部屋の情報を取得できませんでした。',
    reconnecting: '再接続中です。しばらくお待ちください。',
    offline: 'オフラインです。接続が回復すると自動的に再接続します。入力中の内容は保持されます。',
    remainingMinutes: (minutes: number) => `あと約${minutes}分`,
    remainingHours: (hours: number) => `あと約${hours}時間`,
    expiredShort: '期限切れ',
  },

  connection: {
    connecting: '接続中…',
    open: 'リアルタイム接続中',
    reconnecting: '再接続中…',
    offline: 'オフライン',
  },

  host: {
    menu: '主催者メニュー',
    participantUrl: '参加者用URL',
    participantUrlHelp:
      'このURLを Discord などに貼ってください。主催者用のURLは共有しないでください。',
    urlCopied: '参加者用URLをコピーしました。',
    closeRecruiting: '募集を締め切る',
    reopenRecruiting: '募集を再開する',
    generateCandidates: 'チーム候補を作成',
    captainDraft: 'キャプテンドラフト',
    clearSelection: '確定を解除',
    deleteRoom: '部屋を削除',
    activeCountNotice: (required: number, current: number) =>
      `チーム候補の作成にはアクティブ参加者がちょうど${required}人必要です（現在${current}人）。`,
    selectActiveLabel: (required: number, selected: number) =>
      `今回参加する${required}人を選択（選択中 ${selected}人）`,
    applySelection: (required: number) => `この${required}人で確定`,
    selectActiveHelp: '下の参加者一覧のチェックボックスで選択し、このボタンを押してください。',
    statusOpened: '募集を開始しました。',
    statusClosed: '募集を締め切りました。',
    activeUpdated: 'アクティブ参加者を更新しました。',
    candidatesCreated: (count: number) => `チーム候補を${count}件作成しました。`,
    teamConfirmed: 'チームを確定しました。',
    selectionCleared: '確定を解除しました。',
    playerRemoved: (name: string) => `${name} を削除しました。`,
    playerUpdated: (name: string) => `${name} の登録内容を修正しました。`,
    roomDeleted: '部屋を削除しました。',
    statusChangeFailed: '募集状態の変更に失敗しました。',
    activeUpdateFailed: 'アクティブ参加者の更新に失敗しました。',
    generateFailed: 'チーム候補の作成に失敗しました。',
    confirmFailed: 'チームの確定に失敗しました。',
    clearFailed: '確定の解除に失敗しました。',
    removeFailed: '参加者の削除に失敗しました。',
    deleteRoomFailed: '部屋の削除に失敗しました。',
    editPlayerFailed: '参加者の修正に失敗しました。',
  },

  player: {
    myRegistration: 'あなたの登録',
    editRegistration: '登録内容を編集',
    withdraw: '参加を辞退',
    joined: '参加登録が完了しました。',
    updated: '登録内容を更新しました。',
    withdrew: '参加を辞退しました。',
    joinFailed: '参加登録に失敗しました。',
    updateFailed: '更新に失敗しました。',
    withdrawFailed: '辞退に失敗しました。',
    roomFullTitle: '参加登録',
    roomFullBody: (max: number) => `参加者が上限（${max}人）に達しています。`,
    closedBody: '現在は募集を締め切っています。',
  },

  form: {
    joinTitle: '参加登録',
    editTitle: '登録内容の編集',
    hostEditTitle: (name: string) => `${name} の登録内容を修正`,
    hostEditNote: '主催者として、この参加者の登録内容を修正します。',
    displayName: '表示名',
    displayNameHelp: `部屋の中で重複しない名前を${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`,
    eligibleRoles: '参加可能なロール',
    eligibleRolesHelp: '選択したロールは、下で希望順位とランクを設定します。',
    preferenceAndRank: '希望順位とランク',
    preferenceHelp:
      '同じ順位を選ぶと「どちらでもよい」になります。ランクが未計測の場合は、近いと思う値を選んで「未計測（推定で入力）」にチェックを入れてください。',
    makeAllSame: 'すべて同順位（どれでもよい）にする',
    preferenceNth: (nth: number) => `第${nth}希望`,
    tiedWith: (roles: string) => `（${roles} と同順位）`,
    noDivision: 'ディビジョンなし',
    estimated: '未計測（推定で入力）',
    adjustmentNote: (experience: string, adjustment: number) =>
      `未計測かつ${experience}のため、内部レートを ${adjustment} 補正します。`,
    submitJoin: '参加登録する',
    submitEdit: '変更を保存する',
    submitting: '送信中…',
    tierLabel: (role: string) => `${role} のティア`,
    divisionLabel: (role: string) => `${role} のディビジョン`,
    experienceLabel: (role: string) => `${role} のプレイ歴`,
    preferenceRankLabel: (role: string) => `${role} の希望順位`,
    turnstileLabel: 'ロボットではないことの確認',
    turnstileLoadFailed:
      '認証ウィジェットを読み込めませんでした。通信環境を確認して再読み込みしてください。',
  },

  playerList: {
    title: '参加者一覧',
    empty: 'まだ参加者がいません。参加用URLを共有してください。',
    summary: (count: number, active: number) => `${count}人 / アクティブ ${active}人`,
    selectHint: (required: number) => `（${required}人選択してください）`,
    you: 'あなた',
    active: '参加中',
    waiting: '待機',
    edit: '修正',
    remove: '削除',
    includeInDraw: (name: string) => `${name} を今回のチーム分けに含める`,
    anyRole: 'どれでもよい',
    estimatedShort: '推定',
  },

  teams: {
    confirmedTitle: '確定チーム',
    candidatesTitle: (count: number) => `チーム候補（${count}件）`,
    candidatesHint: 'スコアが低いほどバランスが良い候補です。',
    candidateNth: (nth: number) => `候補 ${nth}`,
    selectedBadge: '確定中',
    selectThis: 'この候補で確定する',
    currentlySelected: 'この候補で確定中',
    total: (value: number) => `合計 ${value}`,
    preferenceNth: (nth: number) => `第${nth}希望`,
    outOfPreference: '希望外',
    copyDiscord: 'Discord用テキストをコピー',
    copied: 'Discord用テキストをコピーしました。',
    copyFallback: 'コピーできない場合はこちら',
    discordTextLabel: 'Discord用テキスト',
    manualAdjust: '手動で入れ替える',
    metrics: {
      score: '総合スコア',
      totalRankDiff: '総合ランク差',
      tankRankDiff: 'Tank差',
      damageAvgDiff: 'Damage平均差',
      supportAvgDiff: 'Support平均差',
      positionalRankDiff: '上位者の偏り',
      preferencePenalty: '希望ペナルティ',
    },
  },

  lineup: {
    help: '入れ替えたい2人を順にタップ（クリック）してください。担当できないロールへの入れ替えは行われません。',
    diffLabel: '元の候補との差',
    noChange: '変更なし',
    scoreChange: (before: string, after: string) => `総合スコア ${before} → ${after}`,
    save: 'この編成で確定する',
    reset: '元に戻す',
    stop: '調整をやめる',
    saved: '手動調整した編成で確定しました。',
    saveFailed: '編成の確定に失敗しました。',
  },

  draft: {
    title: 'キャプテンドラフト',
    inProgress: '進行中',
    completed: '完了',
    completedNotice: 'ドラフトが完了しました。下の確定チームをご確認ください。',
    finished: 'ドラフトは終了しています。',
    currentTurn: (team: string, name: string) => `現在の手番: TEAM ${team}（${name}）`,
    yourTurn: 'あなたの番です',
    remainingPicks: (count: number) => `残り ${count} 指名`,
    captainOf: (name: string) => `キャプテン: ${name}`,
    captainMark: 'C',
    poolTitle: (count: number) => `未指名（${count}人）`,
    waitingForCaptain: '手番のキャプテンが指名するのを待っています。画面は自動で更新されます。',
    pickAs: (role: string) => `${role} で指名`,
    noOpenSlot: '空いている枠に入れられません。',
    cancelDraft: 'ドラフトを中止',
    setupHelp: (tank: number, damage: number, support: number) =>
      `キャプテン2人とその担当ロールを決めます。残り8人は A→B→B→A→A→B→B→A の順でキャプテンが交互に指名します（各チーム Tank×${tank} / Damage×${damage} / Support×${support}）。`,
    captainFor: (team: string) => `TEAM ${team} のキャプテン`,
    captainRoleFor: (team: string) => `TEAM ${team} のキャプテンの担当ロール`,
    start: 'ドラフトを開始',
    stop: 'やめる',
    started: 'キャプテンドラフトを開始しました。',
    cancelled: 'ドラフトを中止しました。',
    startFailed: 'ドラフトを開始できませんでした。',
    pickFailed: '指名に失敗しました。',
    cancelFailed: 'ドラフトを中止できませんでした。',
  },

  dialog: {
    withdrawTitle: '参加を辞退しますか？',
    withdrawBody: '登録内容が削除されます。再度参加するには、もう一度登録が必要です。',
    withdrawConfirm: '辞退する',
    removePlayerTitle: 'この参加者を削除しますか？',
    removePlayerBody: (name: string) => `${name} の登録内容を削除します。`,
    removeConfirm: '削除する',
    deleteRoomTitle: '部屋を削除しますか？',
    deleteRoomBody: '参加者情報と確定結果がすべて削除され、URLは使用できなくなります。',
    clearSelectionTitle: 'チームの確定を解除しますか？',
    clearSelectionBody: '全参加者の画面から確定結果が消えます。候補からもう一度選び直せます。',
    clearSelectionConfirm: '解除する',
    processing: '処理中…',
    defaultConfirm: '実行する',
  },

  copy: {
    failed: 'コピーできませんでした。テキストを選択してコピーしてください。',
    discordRoomName: '部屋名',
  },

  experience: {
    main: 'メイン（普段からやる）',
    sub: 'サブ（そこそこやる）',
    rare: 'たまに（不慣れ）',
    mainShort: 'メイン',
    subShort: 'サブ',
    rareShort: '不慣れ',
  },

  /** ロール名。日本のコミュニティでは英語表記が定着しているためそのまま使う。 */
  roles: {
    tank: 'Tank',
    damage: 'Damage',
    support: 'Support',
  },

  /** ランクのティア名（短縮表記 BRZ/DIA などは言語共通のため constants 側に置いたまま） */
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
    BAD_REQUEST: 'リクエストの内容が正しくありません。',
    INVALID_JSON: 'リクエストの形式が正しくありません。',
    UNSUPPORTED_MEDIA_TYPE: 'サポートされていない形式のリクエストです。',
    PAYLOAD_TOO_LARGE: '送信されたデータが大きすぎます。',
    METHOD_NOT_ALLOWED: 'この操作は許可されていません。',
    VALIDATION_ERROR: '入力内容を確認してください。',
    TURNSTILE_REQUIRED: '認証（Turnstile）を完了してください。',
    TURNSTILE_FAILED: '認証に失敗しました。もう一度お試しください。',
    RATE_LIMITED: '操作が多すぎます。しばらく待ってから再度お試しください。',
    UNAUTHORIZED: 'この操作を行う権限がありません。',
    FORBIDDEN: 'この操作を行う権限がありません。',
    NOT_FOUND: '対象が見つかりません。',
    ROOM_NOT_FOUND: '部屋が見つかりません。URLをご確認ください。',
    ROOM_EXPIRED: 'この部屋は有効期限切れ、または削除されています。',
    ROOM_CLOSED: 'この部屋は現在募集を締め切っています。',
    ROOM_FULL: '参加者が上限に達しています。',
    PLAYER_NOT_FOUND: '参加者が見つかりません。',
    DUPLICATE_DISPLAY_NAME: 'その表示名はすでに使われています。別の名前をご利用ください。',
    ACTIVE_COUNT_INVALID: `チーム分けにはアクティブ参加者がちょうど${REQUIRED_ACTIVE_PLAYERS}人必要です。`,
    NO_VALID_LINEUP: '現在の希望ロールでは有効な構成を作れません。',
    CANDIDATE_NOT_FOUND: '指定されたチーム候補が見つかりません。',
    CANDIDATES_NOT_GENERATED: '先にチーム候補を作成してください。',
    DRAFT_NOT_ACTIVE: '進行中のドラフトがありません。',
    NOT_YOUR_TURN: 'いまはあなたの手番ではありません。',
    CONFIG_ERROR: 'サーバー設定に問題があります。管理者にお問い合わせください。',
    INTERNAL_ERROR: 'サーバーでエラーが発生しました。時間をおいて再度お試しください。',
    NETWORK_ERROR: '通信に失敗しました。接続状況をご確認ください。',
  },

  /** サーバー側の入力検証メッセージ（キーで返り、クライアントで翻訳する） */
  validation: {
    'displayName.required': '表示名を入力してください。',
    'displayName.tooLong': `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`,
    'displayName.forbiddenChar': '表示名に使用できない文字が含まれています。',
    'roomTitle.required': '部屋名を入力してください。',
    'roomTitle.tooLong': `部屋名は${ROOM_TITLE_MAX_LENGTH}文字以内で入力してください。`,
    'roomTitle.forbiddenChar': '部屋名に使用できない文字が含まれています。',
    'role.required': '参加可能なロールを1つ以上選択してください。',
    'role.invalid': 'ロールの指定が不正です。',
    'role.duplicate': '参加可能なロールが重複しています。',
    'rank.divisionRequired': 'ランクのディビジョンを指定してください。',
    'rank.divisionInvalid': 'ランクのディビジョンが不正です。',
    'rank.noDivision': 'このティアにディビジョンはありません。',
    'rank.missing': '参加可能にしたロールのランクを入力してください。',
    'rank.unexpected': '参加可能にしていないロールのランクは指定できません。',
    'preference.required': '希望順位を設定してください。',
    'preference.invalid': '希望順位の指定が不正です。',
    'preference.mismatch': '希望順位は参加可能なロールをすべて1回ずつ含める必要があります。',
    'turnstile.required': '認証（Turnstile）を完了してください。',
    'turnstile.invalid': '認証トークンが不正です。',
    'activePlayers.tooMany': '選択できる人数を超えています。',
    'activePlayers.duplicate': '同じ参加者が重複して選択されています。',
    'activePlayers.limit': `アクティブ参加者は最大${REQUIRED_ACTIVE_PLAYERS}人までです。`,
    'lineup.size': `編成には${REQUIRED_ACTIVE_PLAYERS}人が必要です。`,
    'id.invalid': 'IDの形式が不正です。',
  },

  /** チーム分け・ドラフトが返す動的なメッセージ */
  balance: {
    playerCountMismatch: (required: number, current: number) =>
      `チーム分けにはちょうど${required}人が必要です（現在${current}人）。`,
    duplicateId: '参加者IDが重複しています。',
    noEligibleRoles: (name: string) => `${name} の参加可能ロールが設定されていません。`,
    duplicateRoles: (name: string) => `${name} の参加可能ロールが重複しています。`,
    invalidRank: (name: string, role: string) => `${name} の ${role} のランクが不正です。`,
    preferenceMissing: (name: string, role: string) =>
      `${name} の希望順位に ${role} が含まれていません。`,
    roleShortage: (role: string, required: number, current: number) =>
      `${role}を担当可能な参加者が${required}人必要です（現在${current}人）。`,
    noValidLineup: '現在の希望ロールでは有効な構成を作れません。',
    lineupSize: (required: number, current: number) =>
      `編成には${required}人が必要です（現在${current}人）。`,
    strangerInLineup: '編成に参加者以外が含まれています。',
    duplicateInLineup: (name: string) => `${name} が重複しています。`,
    cannotPlayRole: (name: string, role: string) => `${name} は ${role} を担当できません。`,
    slotCountMismatch: (team: string, role: string, required: number, current: number) =>
      `Team ${team} の ${role} は${required}人である必要があります（現在${current}人）。`,
  },

  draftLogic: {
    captainNotFound: 'キャプテンに指定された参加者が見つかりません。',
    captainsMustDiffer: '2人の異なるキャプテンを指定してください。',
    captainRoleInfeasible: 'このキャプテンのロールでは、残りの参加者で構成を埋められません。',
    alreadyFinished: 'ドラフトはすでに終了しています。',
    playerNotFound: '指名された参加者が見つかりません。',
    alreadyPicked: (name: string) => `${name} はすでに指名されています。`,
    slotFull: (team: string, role: string) => `Team ${team} の ${role} はすでに埋まっています。`,
    wouldBreakLineup: (name: string, role: string) =>
      `${name} を ${role} にすると、残りの参加者で構成を埋められなくなります。`,
    notYourTurn: 'いまはあなたの手番ではありません（手番のキャプテンか主催者のみ指名できます）。',
  },

  privacy: {
    title: 'プライバシーポリシー',
    intro: (service: string) =>
      `${service}（以下「本サービス」）における個人情報等の取り扱いについて、以下のとおり定めます。`,
    translationNote:
      'この文書は日本語版を正本とします。翻訳版との間に相違がある場合は、日本語版が優先されます。',
    s1Title: '1. 保存する情報',
    s1Items: [
      '参加者が入力した表示名',
      '参加可能なロール、その希望順位',
      'ロールごとの現在または推定ランク、未計測かどうか、プレイ歴の自己申告',
      '部屋名、部屋の作成日時・有効期限、募集状態、確定したチーム構成',
    ],
    s1Body:
      'これらは、部屋ごとに割り当てられた Cloudflare Durable Objects の SQLite ストレージへ保存されます。',
    s2Title: '2. アカウント登録を行いません',
    s2Body:
      '本サービスはアカウント登録機能を持たず、メールアドレス、電話番号、SNSアカウント等の取得は行いません。表示名は利用者が自由に決められるニックネームであることを想定しています。本名など、公開されて困る情報は入力しないでください。',
    s3Title: '3. データの保持期間',
    s3Body:
      '部屋のデータは、作成から原則24時間で自動的に削除されます。削除時には、参加者情報（表示名・ロール・ランク）、権限トークンのハッシュ値、確定したチーム結果を消去します。主催者が手動で部屋を削除した場合も同様に、以後はアクセスできなくなります。',
    s4Title: '4. 権限トークンとブラウザへの保存',
    s4Body1:
      '本サービスは、主催者・参加者を識別するためにランダムな権限トークンを発行します。トークンは利用者のブラウザの localStorage へ部屋ごとに分けて保存されます。サーバー側にはトークンそのものを保存せず、秘密鍵を用いた HMAC-SHA-256 によるハッシュ値のみを保存します。',
    s4Body2:
      'ブラウザのデータを消去するとトークンも失われ、主催者操作や自分の登録の編集ができなくなる場合があります。',
    s5Title: '5. IPアドレスの取り扱い',
    s5Body:
      '短時間に大量のリクエストを行う不正利用を防ぐため、レート制限を実施しています。この際、IPアドレスそのものは保存せず、秘密鍵と時間帯を組み合わせた HMAC により生成した不可逆な識別値のみを、短時間（最大1時間程度）だけ保持します。識別値は一定時間ごとに変化し、元のIPアドレスを復元することはできません。',
    s6Title: '6. Cloudflare Turnstile の利用',
    s6Body:
      '部屋の作成および新規参加登録の際に、自動化されたアクセスを防ぐため Cloudflare Turnstile を利用します。利用にあたり、Cloudflare 社に対して通信情報が送信される場合があります。詳細は Cloudflare 社のプライバシーポリシーをご確認ください。',
    s7Title: '7. 外部サービスへのデータ送信',
    s7Body:
      '本サービスは、参加者のランクやプレイ歴を外部サービスから取得することはありません。Overwatch 2 のランクを取得する公式APIが存在せず、非公式な取得方法は Blizzard の利用規約で禁止されているためです。入力された情報は本サービス外へ送信されません（Turnstile を除く）。',
    s8Title: '8. アクセス解析・広告',
    s8Body:
      '初期版では、アクセス解析ツールおよび広告トラッキングは使用していません。第三者へのデータ提供・販売も行いません。',
    s9Title: '9. お問い合わせ・変更',
    s9Body:
      '本ポリシーは、機能の追加や法令の変更等に応じて予告なく変更される場合があります。変更後の内容は本ページに掲載します。',
  },

  terms: {
    title: '利用規約',
    intro: (service: string) =>
      `本規約は、${service}（以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約に同意したものとみなします。`,
    s1Title: '1. 非公式サービスであること',
    s1Body:
      '本サービスは有志による非公式のコミュニティツールであり、Overwatch および Blizzard Entertainment の公式素材・ロゴ・画像は使用していません。ゲーム内の仕様変更等により、実際のゲームと表記が一致しない場合があります。',
    s2Title: '2. 動作保証について',
    s2Body:
      '本サービスは現状有姿で提供され、動作の完全性・正確性・可用性について、いかなる保証も行いません。チーム分けの結果はあくまで参考であり、公平性を保証するものではありません。本サービスの利用または利用不能により生じた損害について、運営者は一切の責任を負いません。',
    s3Title: '3. 禁止事項',
    s3Items: [
      '他の利用者への嫌がらせ、なりすまし、誹謗中傷にあたる表示名の使用',
      '虚偽のランク・ロール情報の意図的な登録による妨害行為',
      '自動化ツール等による過度なアクセス、レート制限の回避',
      '本サービスの脆弱性を悪用する行為、リバースエンジニアリングによる不正アクセス',
      '法令または公序良俗に反する行為',
    ],
    s4Title: '4. 部屋の管理責任',
    s4Body:
      '部屋の管理（参加者の選定・削除、募集の開始と締切、チームの確定、部屋の削除）は、部屋を作成した主催者の責任において行われます。主催者用URLの管理も主催者の責任であり、第三者へ共有しないでください。運営者は個別の部屋の運用には関与しません。',
    s5Title: '5. サービスの変更・停止',
    s5Body:
      '運営者は、予告なく本サービスの内容を変更し、または提供を停止・終了することがあります。これにより利用者に生じた損害について、運営者は責任を負いません。',
    s6Title: '6. データの削除',
    s6Body:
      '部屋のデータは作成から原則24時間で削除されます。必要な結果は、期限内に各自で保存してください。',
  },
};

/**
 * 他の言語が満たすべき型（ja の構造がそのまま型になる）。
 * `as const` を付けないことで文字列は string 型に広がり、
 * 「キーの構造は同じ・中身は各言語」という制約になる。
 */
export type Messages = typeof ja;

/** ErrorCode の追加漏れを型で検出する */
const _errorCoverage: Record<ErrorCode, string> = ja.errors;
void _errorCoverage;
