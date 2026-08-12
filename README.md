# OW Custom Balancer

Overwatch 2 のカスタムゲーム向けに、参加者自身がロール希望とロール別ランクを登録し、
主催者がバランスのよい 5vs5 チームを作成できる Web サービスです。

> **本サービスは非公式のコミュニティツールであり、Blizzard Entertainment とは関係ありません。**
> Overwatch / Blizzard のロゴ・画像・公式素材は一切使用していません。

---

## 目次

1. [サービス概要](#サービス概要)
2. [技術構成](#技術構成)
3. [必要環境](#必要環境)
4. [ローカルでの起動方法](#ローカルでの起動方法)
5. [Cloudflare アカウントの準備](#cloudflare-アカウントの準備)
6. [Turnstile ウィジェットの作成](#turnstile-ウィジェットの作成)
7. [ローカル用の環境変数設定](#ローカル用の環境変数設定)
8. [Wrangler Secret の設定](#wrangler-secret-の設定)
9. [初回デプロイ](#初回デプロイ)
10. [Durable Objects の migration](#durable-objects-の-migration)
11. [GitHub Actions の設定](#github-actions-の設定)
12. [独自ドメインの設定](#独自ドメインの設定)
13. [テスト方法](#テスト方法)
14. [データ保持期間](#データ保持期間)
15. [無料枠を超えた場合の注意](#無料枠を超えた場合の注意)
16. [セキュリティ上の注意](#セキュリティ上の注意)
17. [よくあるエラーと対処方法](#よくあるエラーと対処方法)
18. [ディレクトリ構成](#ディレクトリ構成)

---

## サービス概要

### 使い方の流れ

1. 主催者がトップページで部屋名を入力し、Turnstile 認証を通して部屋を作成する
2. 「参加者用URL」と「主催者用URL」が発行される
3. 主催者が参加者用URLを Discord などに貼る
4. 参加者が名前・担当できるロール・希望順位・ロール別ランクを登録する
5. 参加者一覧が全員の画面でリアルタイムに更新される
6. 11人以上いる場合は、主催者が今回参加する10人を選ぶ
7. 主催者が「チーム候補を作成」を押すと、バランスのよい候補が最大5件表示される
8. 主催者が候補を1件確定すると、全参加者の画面へ即時反映される
9. 必要なら主催者が手動で入れ替えて再確定できる
10. Discord へ貼り付けられる形式で結果をコピーできる

### 主な仕様

| 項目           | 内容                                                  |
| -------------- | ----------------------------------------------------- |
| チーム構成     | Tank×1 / Damage×2 / Support×2 の 5人 × 2チーム        |
| 最大参加人数   | 20人（チーム分けに使うのはちょうど10人）              |
| ランク         | Bronze 5 〜 Champion（連続整数 0〜40 に変換して評価） |
| 部屋の有効期限 | 作成から24時間（自動削除）                            |
| アカウント登録 | 不要（権限トークン方式）                              |
| ランクの取得   | 自己申告のみ（外部APIは使用しません。理由は下記）     |

### 希望ロールは「同順位（どちらでもよい）」を指定できます

「Tank か Support ならどっちでもいい」「どれでもいい」といった希望を、そのまま登録できます。
参加者は選んだロールごとに希望順位を選び、**同じ順位を選んだロールは同順位（=どちらに割り当てられてもペナルティなし）**
として扱われます。「すべて同順位（どれでもよい）にする」ボタンも用意しています。

内部では希望順位を「グループの配列」で保持します。

| 登録内容                                           | 内部表現                           | ペナルティ                    |
| -------------------------------------------------- | ---------------------------------- | ----------------------------- |
| Tank が第1希望、Damage が第2希望                   | `[['tank'], ['damage']]`           | Tank:0 / Damage:6             |
| Tank と Support はどちらでもよい、Damage は第2希望 | `[['tank','support'], ['damage']]` | Tank:0 / Support:0 / Damage:6 |
| どれでもよい                                       | `[['tank','damage','support']]`    | すべて 0                      |

### ランク構成（Champion はディビジョンなし）

ティアは Bronze 〜 Champion の9段です。**Platinum と Diamond の間に Emerald** があり、
**Bronze 〜 Grandmaster は各5ディビジョン（5が最下位、1が最上位）ですが、Champion はディビジョンを持ちません。**
ゲーム側のランクシステム変更に追随しています。

```
Bronze → Silver → Gold → Platinum → Emerald → Diamond → Master → Grandmaster → Champion
```

| ティア                | ディビジョン | スコア                            |
| --------------------- | ------------ | --------------------------------- |
| Bronze 〜 Grandmaster | 5 〜 1       | Bronze 5 = 0 … Grandmaster 1 = 39 |
| Champion              | なし         | 40                                |

ディビジョンの有無は [`src/shared/ranks.ts`](src/shared/ranks.ts) の `TIER_DIVISION_COUNT` で定義しています。
今後さらにティア構成が変われば、この表を書き換えるだけでスコア変換・入力フォーム・バリデーションがすべて追随します。
保存済みデータは読み出し時に `normalizeLegacyRank` で現行仕様へ寄せるため、稼働中の部屋が壊れることはありません。

### ランクは自己申告です（外部APIを使わない理由）

**Overwatch 2 のランクを取得できる公式APIは存在しません。** Blizzard Developer API の対象は
WoW / Diablo / Hearthstone / StarCraft のみで、Overwatch 2 は含まれていません。

キャリアプロフィールを解析する非公式APIは存在しますが、Blizzard Developer API 利用規約には次の条項があります。

> "You May Not Data Mine Blizzard Products Or Services. Except as permitted through authorized use of
> the Blizzard Developer APIs, You will not perform any data-mining, scraping, crawling, or use any
> processes that sends automated queries to Blizzard"

Battle.net 利用規約・EULA でも、Blizzard が明示的に許可していない方法でサービスから情報を取得すること、
情報を "mine" する非公認ソフトを使うことが禁止されています。**許可された経路が存在しない以上、
本サービスは外部からのランク自動取得を行いません。** 規約上のリスクに加え、非公式APIが停止・ブロックされると
機能ごと死ぬという実運用上の問題もあります。

その代わり、必要な情報は**すべて本人の自己申告**で集め、内部レートはこちら側で推定します。

| 入力項目       | 内容                                                       |
| -------------- | ---------------------------------------------------------- |
| ロール別ランク | 現在または推定のランク（必須）                             |
| 未計測フラグ   | 実測していない場合にチェック。一覧に「推定」と表示される   |
| プレイ歴       | メイン（普段からやる）／サブ（そこそこ）／たまに（不慣れ） |

### 内部レートの推定

チーム分けの評価にはランクそのものではなく、**内部レート**を使います。

```
内部レート = ランクスコア + プレイ歴補正
```

プレイ歴補正は `EXPERIENCE_ADJUSTMENT`（メイン: 0 / サブ: -2 / たまに: -5）です。ただし
**実測ランクがある場合は補正しません**。実測ランクはそのロールでの実力をすでに表しているためで、
補正するのは「未計測（推定）」を申告した場合だけです（`APPLY_EXPERIENCE_ADJUSTMENT_ONLY_WHEN_ESTIMATED`）。
これにより「未計測なのに自己申告が高すぎる」ケースの過大評価を抑えます。

画面には**入力どおりのランク**が表示され、内部レートは候補のスコア計算とチーム合計に使われます。
「推定」「サブ」「不慣れ」は一覧とチーム表示にラベルとして出るので、主催者が数字の確からしさを判断できます。

> **プレイ時間から実力を推定することはしていません。** プレイ時間と勝率・実力の相関は弱く
> （1万時間の Gold も珍しくありません）、根拠の薄い数値で編成を動かすと納得感を損なうためです。
> プレイ歴はあくまで「未計測ランクの信頼度」として使います。

### キャプテンドラフト

自動生成のかわりに、**キャプテン2人が交互に指名してチームを組む**モードも使えます。

1. 主催者がキャプテン2人とその担当ロールを決めて開始する
2. 残り8人を **A → B → B → A → A → B → B → A** のスネークドラフトで指名する
3. 全員決まると、その編成がそのまま確定チームになる

**指名は各キャプテンが自分の端末から行えます。** 手番でないキャプテンや、キャプテンでない参加者の指名は
サーバー側で拒否されます（主催者は代理指名も可能）。盤面は参加者全員の画面へリアルタイムで配信されるので、
Discord のボイスチャットをしながら全員が同じ画面を見て進められます。

ロールキュー構成（Tank×1 / Damage×2 / Support×2）を満たす必要があるため、
**「その指名をすると残りの人で枠を埋められなくなる」場合は指名できません**（Hall の条件で判定）。
選べるロールだけがボタンとして表示されるので、デッドロックは起きません。

### 主催者による参加者の修正

参加者一覧の「修正」から、**主催者が他の参加者の登録内容を直せます**。ランクの打ち間違いを本人が
離席していても直せるようにするためで、それまでは削除するしかありませんでした。
本人の編集トークンでの自己編集は従来どおり有効です。

### 確定後の手動調整

自動生成はあくまで提案です。「この2人は同じチームにしたい」「今日はこの人に Tank をやってほしい」といった
事情はアルゴリズムでは拾えないため、**主催者が確定チームを手で入れ替えられます**。

- 入れ替えたい2人を順にクリックすると、ロールと所属チームがまとめて入れ替わります（ロール枠は必ず保たれます）
- 担当できないロールへの入れ替えはブロックし、理由を表示します
- 入れ替えるたびに指標を再計算し、**元の候補からスコアがどう変わったか**を表示します

画面上の再計算とサーバー側の検証は、どちらも同じ `evaluateLineup` を使います。クライアントから送られた編成は
サーバーで改めて検証・採点されるため、不正な編成（担当外ロール・人数違い・重複・参加者以外）は保存されません。

### チーム分けの評価式

チーム分けは**貪欲なドラフトではなく全探索**です。参加可能ロールと枠数（Tank2/Damage4/Support4）を満たす
割り当てをバックトラッキングで列挙し、各チーム分割をスコア化して、上位5件を返します。
スコアが低いほど良い候補です。重みは [`src/shared/constants.ts`](src/shared/constants.ts) の
`BALANCE_WEIGHTS` と `PREFERENCE_PENALTIES` で1か所にまとまっており、簡単に変更できます。

```
スコア = 1.0 × 両チーム総合ランク差
       + 1.5 × Tank同士のランク差
       + 1.0 × Damage平均ランク差
       + 1.0 × Support平均ランク差
       + 1.0 × 上位者の偏り
       + 希望順位ペナルティ（第1希望:0 / 第2希望:6 / 第3希望:15）
```

**上位者の偏り**は、各チームをランク降順に並べ、1番手同士・2番手同士…と順位ごとに比較した差の合計です。
合計ランクだけで評価すると「片方のチームに上位2人が固まり、もう片方は全員中位」という編成も
同点になってしまいます。この項を入れることで、**ランクが高い人から交互に振り分けるスネークドラフトに近い結果**
（各チームに同格のエースがいる状態）へ寄せています。IGL（指示役）を各チームに配置したい場合はこの重みを大きく、純粋な合計の釣り合いを優先したい場合は小さくしてください
（`BALANCE_WEIGHTS.positionalRankDiff`）。生成された候補にはこの値も表示されるので、主催者が比較して選べます。

---

## 技術構成

- TypeScript（strict）
- React 19 + Vite 7
- Cloudflare Workers（React の静的ファイル・API・Durable Objects を1つの Worker として配信）
- Cloudflare 公式 Vite プラグイン（`@cloudflare/vite-plugin`）
- Cloudflare Durable Objects（**SQLite-backed**）
- Durable Objects WebSocket Hibernation API（リアルタイム同期）
- Durable Objects Alarms（24時間後の自動削除・レート制限データの掃除）
- Cloudflare Turnstile（部屋作成・新規参加時のサーバー側検証）
- Zod（サーバー側の入力検証）
- Vitest + `@cloudflare/vitest-pool-workers`（実際の workerd 上でのテスト）
- npm / GitHub Actions

外部データベース、Supabase、Firebase、Discord Bot、Next.js、Pages Functions、常時稼働サーバーは使用していません。

---

## 必要環境

- Node.js 20 以上（推奨: 22 LTS）
- npm 10 以上
- Cloudflare アカウント（無料プランで可）
- Git（GitHub Actions を使う場合）

バージョン確認:

```bash
node -v
```

```bash
npm -v
```

---

## ローカルでの起動方法

### 1. 依存関係をインストール

```bash
npm install
```

### 2. ローカル用の秘密値ファイルを作成

```bash
cp .dev.vars.example .dev.vars
```

Windows の PowerShell の場合:

```bash
Copy-Item .dev.vars.example .dev.vars
```

`.dev.vars` の初期値には Cloudflare 公式のテストキーが入っているため、
そのままでもローカル開発とテストが動きます（Turnstile は常に成功します）。

### 3. 開発サーバーを起動

```bash
npm run dev
```

表示された `http://localhost:5173` をブラウザで開いてください。
複数のブラウザ（またはシークレットウィンドウ）から同じ参加者用URLを開くと、
リアルタイム同期の動作を確認できます。

### そのほかのコマンド

| コマンド            | 内容                                                   |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | 開発サーバーを起動                                     |
| `npm run typecheck` | 型チェック（client / worker / test / node 設定すべて） |
| `npm test`          | テストをウォッチモードで実行                           |
| `npm run test:run`  | テストを1回だけ実行                                    |
| `npm run build`     | 本番ビルド                                             |
| `npm run deploy`    | ビルドして Cloudflare Workers へデプロイ               |
| `npm run lint`      | ESLint                                                 |
| `npm run format`    | Prettier で整形                                        |

---

## Cloudflare アカウントの準備

1. [Cloudflare](https://dash.cloudflare.com/sign-up) でアカウントを作成する
2. ダッシュボード右側に表示される **Account ID** を控える
   （後で `CLOUDFLARE_ACCOUNT_ID` として使います）
3. ローカルから初めてデプロイする場合は、次のコマンドでブラウザ認証します

```bash
npx wrangler login
```

> Durable Objects の **SQLite バックエンド**は無料プランでも利用できます。
> 旧来の KV バックエンドの Durable Objects は使用していません。

### API トークンの作成（GitHub Actions 用）

1. Cloudflare ダッシュボード → 右上のアイコン → **My Profile** → **API Tokens**
2. **Create Token** → テンプレート **Edit Cloudflare Workers** を選択
3. Account Resources に自分のアカウントを指定して作成
4. 表示されたトークンを控える（後で `CLOUDFLARE_API_TOKEN` として使います）

---

## Turnstile ウィジェットの作成

1. Cloudflare ダッシュボード → 左メニュー **Turnstile** → **Add widget**
2. 任意の名前を入力
3. **Hostname** に公開するドメインを追加する
   - 例: `owcb.example.com`
   - ローカル確認用に `localhost` も追加しておくと便利です
4. Widget Mode は **Managed** を選択
5. 作成すると **Site Key**（公開値）と **Secret Key**（秘密値）が発行されます

### Site Key を設定する（公開値）

[`wrangler.jsonc`](wrangler.jsonc) の `vars.TURNSTILE_SITE_KEY` を、発行された Site Key に書き換えます。

```jsonc
"vars": {
  "TURNSTILE_SITE_KEY": "0x4AAAAAAA_あなたのサイトキー"
}
```

Site Key は公開して問題ない値です。ブラウザへは `GET /api/config` 経由で渡され、
JavaScript のバンドルには埋め込まれません。

### Secret Key を設定する（秘密値）

Secret Key は次章の Wrangler Secret として設定します。**絶対にコミットしないでください。**

> **ローカル開発・自動テスト用のテストキー**
> Cloudflare が公開しているテストキーを使えます（実際の認証は行われず常に成功します）。
>
> - Site Key: `1x00000000000000000000AA`
> - Secret Key: `1x0000000000000000000000000000000AA`
>
> 本番では、Secret Key が未設定の場合に検証をスキップするのではなく **必ずエラー（500）** を返す実装になっており、
> 検証を無効化することはできません。

---

## ローカル用の環境変数設定

ローカル開発では `.dev.vars` を使います（`.gitignore` 済み）。

```
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"
TOKEN_HMAC_SECRET="ここに32文字以上のランダム文字列"
IP_HASH_SECRET="ここに32文字以上の別のランダム文字列"
```

ランダム文字列は次のコマンドで生成できます。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## Wrangler Secret の設定

本番環境（Cloudflare 側）には、次の3つを **Wrangler Secret** として登録します。
1つずつ実行し、プロンプトに値を貼り付けてください。

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

```bash
npx wrangler secret put TOKEN_HMAC_SECRET
```

```bash
npx wrangler secret put IP_HASH_SECRET
```

| Secret 名              | 用途                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `TURNSTILE_SECRET_KEY` | Turnstile のサーバー側検証（siteverify）に使用               |
| `TOKEN_HMAC_SECRET`    | 主催者トークン・編集トークンをハッシュ化して保存するための鍵 |
| `IP_HASH_SECRET`       | レート制限用に IP を短期の不可逆識別値へ変換するための鍵     |

> `TOKEN_HMAC_SECRET` を後から変更すると、**既存の部屋の主催者トークンと編集トークンがすべて無効**になります。
> 運用開始後は変更しないでください。

---

## 初回デプロイ

Secret の設定が終わったら、次のコマンドでデプロイします。

```bash
npm run deploy
```

このコマンドは内部で `vite build` → `wrangler deploy` を実行します。
成功すると `https://ow-custom-balancer.<あなたのサブドメイン>.workers.dev` が表示されます。

Worker 名を変えたい場合は [`wrangler.jsonc`](wrangler.jsonc) の `name` を変更してください。
サービス表示名を変えたい場合は [`src/shared/constants.ts`](src/shared/constants.ts) の `SERVICE_NAME` を変更します。

---

## Durable Objects の migration

`wrangler.jsonc` に次の migration が定義済みです。**初回デプロイ時に自動で適用される**ため、
別途コマンドを実行する必要はありません。

```jsonc
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": ["RoomDurableObject", "RateLimitDurableObject"]
  }
]
```

`new_sqlite_classes` を使っているため、SQLite バックエンドの Durable Object として作成されます
（旧来の KV バックエンドではありません）。

将来 Durable Object クラスを追加・リネーム・削除する場合は、
既存の `v1` は消さずに `v2`, `v3` … を **追記**してください。

```jsonc
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["RoomDurableObject", "RateLimitDurableObject"] },
  { "tag": "v2", "new_sqlite_classes": ["AnotherDurableObject"] }
]
```

なお、各 Durable Object 内のテーブル定義（`CREATE TABLE IF NOT EXISTS`）は
コンストラクタで毎回実行されるため、再デプロイ後もスキーマは自動的に維持されます。

---

## GitHub Actions の設定

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) が用意されています。
`main` ブランチへ push すると、次の順に実行されます。

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`（型チェック）
4. `npm run test:run`（テスト）
5. `npm run build`（ビルド）
6. `npx wrangler deploy`（Cloudflare Workers へデプロイ）

プルリクエストでは 1〜5 のみ実行され、デプロイは行われません。

### GitHub Secrets の設定

GitHub のリポジトリページで
**Settings → Secrets and variables → Actions → New repository secret** を開き、
次の2つを登録してください。

| Secret 名               | 値                                             |
| ----------------------- | ---------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 「Edit Cloudflare Workers」権限の API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare の Account ID                       |

> Turnstile の Secret Key などは **GitHub ではなく Cloudflare 側（Wrangler Secret）** に設定します。
> GitHub Actions からは設定しません。

---

## 独自ドメインの設定

1. 対象ドメインを Cloudflare に追加し、ネームサーバーを Cloudflare へ向ける
2. Cloudflare ダッシュボード → **Workers & Pages** → 対象の Worker を選択
3. **Settings → Domains & Routes → Add → Custom Domain**
4. 使いたいホスト名（例: `owcb.example.com`）を入力して追加

DNS レコードと証明書は Cloudflare が自動的に設定します。

**追加後に必ず行うこと**: Turnstile ウィジェットの **Hostname** に、
そのドメイン（例: `owcb.example.com`）を追加してください。追加を忘れると認証が失敗します。

---

## テスト方法

```bash
npm run test:run
```

ウォッチモード:

```bash
npm test
```

テストは Cloudflare 公式の `@cloudflare/vitest-pool-workers` を使い、
実際の workerd ランタイム上で実行されます。主な内容は次のとおりです。

- **チーム分け**（`test/balancer.test.ts`）
  - 全員のランクと希望が対称なケース / ロール専任者だけのケース
  - Tank・Damage・Support 担当可能者が不足するケース
  - 複数ロール可能者を使って有効な構成を見つけるケース
  - バランスと希望順位ペナルティの比較 / 同順位（どれでもよい）の扱い
  - 内部レート（ランク + プレイ歴）での評価、表示用ランクとの分離
  - Emerald を含むティア順、Champion（ディビジョンなし）の変換・検証、旧仕様データの読み替え
  - 合計が同じでも上位者が片方へ固まる編成を避けること
  - Team A/B を入れ替えただけの鏡像候補が重複しないこと
  - 同じ入力なら候補の順序が変わらないこと / 候補が最大5件であること
  - 無効な入力（人数・ランク・ID重複）を拒否すること
- **内部レート**（`test/rating.test.ts`）
  - 実測ランクは補正せず、未計測のみプレイ歴で下方修正すること
  - 補正後も 0〜40 の範囲を超えないこと
  - 表示用ランクと内部レートが分離されていること
- **キャプテンドラフト**（`test/draft.test.ts`）
  - スネークドラフトの手番進行、担当外ロール・重複・埋まった枠の拒否
  - 構成が埋められなくなる指名を事前に拒否すること
- **編成の手動調整**（`test/lineup.test.ts`）
  - 自動生成した候補をそのまま評価すると同じ指標になること
  - 入れ替えてもロール枠の人数が崩れないこと
  - 担当外ロール・人数違い・重複・参加者以外を拒否すること
- **入力検証**（`test/validation.test.ts`）
  - ランク ↔ 連続整数の相互変換、表示名の NFKC 正規化・制御文字拒否・長さ制限
  - 不正なロール・不正なランク・ランク未入力の拒否
  - Discord 用テキストの出力形式
- **API・権限・有効期限**（`test/api.test.ts`）
  - 正しい／誤った主催者トークン、他人の編集トークン、トークン無し
  - 主催者による参加者の修正、手番でないキャプテンの指名拒否
  - 表示名重複、参加人数上限、アクティブ人数が10人でない状態
  - Turnstile のサーバー側検証（失敗トークンを拒否）
  - レート制限（429）
  - 期限前はアクセス可能／期限後は 410、Alarm を複数回実行しても安全であること
  - WebSocket 接続とスナップショット配信、認証による権限昇格

テスト中の Turnstile siteverify はテスト設定側でスタブ化されており、
外部ネットワークへは接続しません（[`vitest.config.ts`](vitest.config.ts)）。

---

## データ保持期間

- 部屋のデータは **作成から24時間** で自動的に削除されます（Durable Object Alarm）
- 削除対象: 参加者情報（表示名・ロール・ランク）、権限トークンのハッシュ値、確定したチーム結果
- 主催者が手動で部屋を削除した場合も同様です
- 削除後は、その部屋の URL へアクセスすると **410 Gone** が返ります
- Alarm が万一遅延した場合でも、期限を過ぎた部屋へのアクセス時に同じ削除処理が実行されます（冪等）
- レート制限用の識別値は最大1時間程度で削除されます

---

## 無料枠を超えた場合の注意

Cloudflare Workers の無料プランには次のような上限があります（詳細は Cloudflare の公式ドキュメントをご確認ください）。

- Workers のリクエスト数（1日あたり）
- Durable Objects のリクエスト数・実行時間・SQLite の読み書き行数とストレージ容量

上限に達すると、その日はリクエストがエラーになる、または Durable Objects が利用できなくなります。
継続的に利用する場合は **Workers Paid プラン**（月額5ドル〜）への移行を検討してください。

コストを抑えるための実装上の工夫:

- 部屋データは24時間で自動削除されるため、ストレージが増え続けることはありません
- レート制限により、1つの識別元からの過剰なリクエストを抑制しています
- WebSocket Hibernation API により、接続中でも待機時の課金対象時間を抑えています

利用状況は Cloudflare ダッシュボードの **Workers & Pages → 対象 Worker → Metrics** で確認できます。

---

## セキュリティ上の注意

実装済みの対策:

- **トークンはハッシュ化して保存**: 主催者トークン・編集トークンは Web Crypto の安全な乱数で 256bit 生成し、
  サーバーには `TOKEN_HMAC_SECRET` を使った HMAC-SHA-256 のハッシュのみを保存します。比較は定数時間で行います。
- **主催者トークンを URL に残さない**: 主催者用URLは `/room/:roomId#host=<トークン>` 形式です。
  URL フラグメントはサーバーへ送信されず、ページ表示直後に localStorage へ保存して
  `history.replaceState` で URL から削除します。
- **参加者トークンを露出させない**: 編集トークンは登録成功時のレスポンスでのみ返され、URL や画面には表示しません。
- **サーバー側で全入力を検証**: すべてのリクエストボディを Zod で検証します。フロント側の検証は補助です。
- **Turnstile のサーバー側検証**: クライアントの結果は信用せず、必ず Worker から siteverify を呼びます。
- **レート制限**: IP アドレスそのものは保存せず、`IP_HASH_SECRET` と時間帯を混ぜた HMAC の短期識別値を使います。
- **セキュリティヘッダー**: CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`、
  `X-Frame-Options: DENY`、API への `Cache-Control: no-store` を付与します。
- **Same Origin 前提**: ワイルドカード CORS は設定せず、状態変更リクエストは Origin を検証します。
- **HTML 文字列を直接挿入しない**: 表示はすべて React の通常のテキスト描画です。
- **本番エラーに内部情報を含めない**: スタックトレースや秘密値はレスポンスにもログにも出力しません。

運用上の注意:

- 主催者用URL（`#host=` 付き）は **絶対に共有しないでください**。参加者へは `#host=` の無いURLを渡します。
- ブラウザのデータを消去すると、トークンが失われて主催者操作や自分の登録の編集ができなくなります。
- `.dev.vars`、API トークン、Secret Key は絶対にコミットしないでください（`.gitignore` 済み）。

---

## よくあるエラーと対処方法

| 症状 / エラー                                                             | 原因                                                                                             | 対処                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 画面に「サーバー設定に問題があります」と出る（HTTP 500 / `CONFIG_ERROR`） | `TOKEN_HMAC_SECRET` または `IP_HASH_SECRET` が未設定                                             | ローカルなら `.dev.vars` を作成。本番なら `npx wrangler secret put ...` で設定                  |
| 「認証に失敗しました」（HTTP 403 / `TURNSTILE_FAILED`）                   | Site Key と Secret Key の組み合わせが違う、または Turnstile の Hostname に現在のドメインが未登録 | Turnstile ウィジェットの Hostname にドメインを追加し、`wrangler.jsonc` の Site Key を確認       |
| Turnstile ウィジェットが表示されない                                      | CSP でスクリプトがブロックされている、または通信環境の問題                                       | ブラウザのコンソールを確認。`challenges.cloudflare.com` への通信が許可されているか確認          |
| 「操作が多すぎます」（HTTP 429 / `RATE_LIMITED`）                         | レート制限（部屋作成: 10分に5回、新規参加: 1分に10回、その他更新: 1分に30回）                    | 時間をおいて再試行。制限値は `src/shared/constants.ts` の `RATE_LIMITS` で変更可能              |
| 「この部屋は終了しました」（HTTP 410）                                    | 24時間の有効期限切れ、または主催者が削除した                                                     | 新しい部屋を作成してください                                                                    |
| 主催者メニューが表示されない                                              | 主催者トークンが localStorage に無い（別ブラウザ／データ消去）                                   | 部屋を作成したブラウザで開く。トークンを控えていれば `/room/:roomId#host=<トークン>` で復元可能 |
| 「チーム候補を作成」が押せない                                            | アクティブ参加者がちょうど10人でない                                                             | 11人以上いる場合は参加者一覧で10人を選び「この10人で確定」を押す                                |
| 「Tankを担当可能な参加者が2人必要です」                                   | ロール担当可能者が不足                                                                           | 参加者に担当可能ロールの追加を依頼する                                                          |
| `npm run deploy` で `Authentication error`                                | Cloudflare の認証が未完了、または API トークンの権限不足                                         | `npx wrangler login` を実行、または「Edit Cloudflare Workers」権限のトークンを使う              |
| GitHub Actions のデプロイが失敗する                                       | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が未登録                                        | GitHub の Settings → Secrets and variables → Actions で登録                                     |
| 接続状態が「再接続中…」のまま                                             | ネットワーク断、またはプロキシが WebSocket を遮断している                                        | 通信環境を確認。HTTP からの取得は継続するため、リロードで最新状態は表示されます                 |
| 「その表示名はすでに使われています」                                      | 同じ部屋内で表示名が重複（大文字小文字・全角半角を区別せず判定）                                 | 別の名前を入力してください                                                                      |

---

## ディレクトリ構成

```
.
├── .github/workflows/deploy.yml   GitHub Actions（CI とデプロイ）
├── index.html                     Vite のエントリ HTML
├── wrangler.jsonc                 Cloudflare Workers の設定
├── vite.config.ts                 Vite + Cloudflare プラグイン
├── vitest.config.ts               Workers 向け Vitest 設定
├── src
│   ├── shared/                    フロント・サーバー共通（型・定数・検証・チーム分け）
│   │   ├── constants.ts           サービス名・重み・制限値などの定数
│   │   ├── ranks.ts               ランク ↔ 連続整数の変換
│   │   ├── types.ts               ドメイン型・API型
│   │   ├── errors.ts              エラーコードと利用者向けメッセージ
│   │   ├── validation.ts          Zod スキーマ・表示名の正規化
│   │   ├── rating.ts              内部レートの推定（ランク + プレイ歴）
│   │   ├── lineup.ts              編成データの変換と入れ替え
│   │   ├── draft.ts               キャプテンドラフトの進行ロジック
│   │   ├── balancer.ts            チーム分けロジック（純粋関数）
│   │   └── discord.ts             Discord 用テキストの整形
│   ├── worker/                    Cloudflare Worker と Durable Objects
│   │   ├── index.ts               ルーティング・Turnstile・レート制限
│   │   ├── room-do.ts             部屋の Durable Object（SQLite / WS / Alarm）
│   │   ├── ratelimit-do.ts        レート制限の Durable Object
│   │   ├── crypto.ts              トークン生成・HMAC・定数時間比較
│   │   ├── turnstile.ts           siteverify 呼び出し
│   │   ├── http.ts                レスポンスとセキュリティヘッダー
│   │   └── env.ts                 バインディング定義
│   └── client/                    React アプリ
│       ├── pages/                 トップ・部屋・プライバシー・利用規約
│       ├── components/            フォーム・一覧・候補表示・トースト等
│       ├── hooks/                 WebSocket 同期・公開設定取得
│       └── lib/                   API クライアント・localStorage・整形
└── test/                          Vitest（balancer / validation / api）
```

---

## ライセンス・免責

本サービスは非公式のコミュニティツールです。Overwatch および Blizzard Entertainment とは関係ありません。
チーム分けの結果は参考であり、公平性を保証するものではありません。
