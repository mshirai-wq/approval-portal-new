# 社内承認ポータルシステム

社内の各種申請（稟議、経費、現場情報など）をオンラインで申請・承認・回覧できるポータルサイト。

## 技術スタック

- **フロントエンド:** Next.js (App Router), TypeScript, Tailwind CSS
- **バックエンド / DB:** Firebase (Firestore)
- **認証:** Firebase Authentication
- **ストレージ:** Firebase Cloud Storage
- **デプロイ:** Cloudflare Pages

## セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `approval-portal`）
4. Google Analyticsは無効でOK（Sparkプランで無料）
5. プロジェクトを作成

### 2. Firebaseサービスの有効化

プロジェクト作成後、以下のサービスを有効化：

**Firestore Database:**
- 左メニュー「Build」→「Firestore Database」
- 「データベースを作成」をクリック
- テストモードで開始（後で本番モードに変更）
- ロケーション: `asia-northeast1`（東京）推奨

**Authentication:**
- 左メニュー「Build」→「Authentication」
- 「始める」をクリック
- 「メール/パスワード」を有効化

**Cloud Storage:**
- 左メニュー「Build」→「Storage」
- 「始める」をクリック
- テストモードで開始
- ロケーション: Firestoreと同じにする

### 3. Firebase設定の取得

1. 左メニュー「プロジェクトの概要」→「プロジェクト設定」
2. 下部の「アプリ」セクションで「Web」アイコンをクリック
3. アプリ名を入力（例: `approval-portal`）
4. 「このアプリのFirebase SDK構成」をコピー

### 4. 環境変数の設定

`.env.local` ファイルを作成し、コピーした設定を貼り付け：

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 にアクセス

## デプロイ（Cloudflare Pages）

### 1. Firebase設定の環境変数を追加

Cloudflare Pagesのプロジェクト設定で、以下の環境変数を追加：

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 2. GitHubリポジトリにプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/approval-portal.git
git push -u origin main
```

### 3. Cloudflare Pagesでプロジェクトを作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にアクセス
2. 「Workers & Pages」→「Create application」→「Pages」
3. 「Connect to Git」を選択し、GitHubリポジトリを接続
4. 以下のビルド設定を入力：

```
Framework preset: Next.js
Build command: npx @cloudflare/next-on-pages@1
Build output directory: .vercel/output/static
Environment variable: NODE_VERSION = 20
```

5. 「Compatibility Flags」で `nodejs_compat` を有効化

### 4. デプロイ

GitHubにプッシュすると自動でデプロイされます

### ローカルでCloudflare Pages環境をテスト

```bash
npm run pages:build
npm run pages:dev
```

## Firestoreデータスキーマ

### usersコレクション（社員マスタ）
```typescript
{
  id: string,              // email
  name: string,
  email: string,
  title: string,           // 役職
  department: string,      // 所属部門
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### applicationsコレクション（申請データ）
```typescript
{
  id: string,
  appName: string,         // "稟議"
  subType: string,         // "通常申請", "求人稟議"など
  title: string,
  description: string,
  remarks: string,
  applicantId: string,
  applicantName: string,
  applicantDept: string,
  applicantTitle: string,
  formDetails: { ... },    // 申請種別ごとの詳細
  workflow: {
    currentStep: string,
    status: string,
    decisionMaker: string,
    steps: { ... },
    circulations: string[],
    confirmedBy: string[]
  },
  attachments: [ ... ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### approvalsコレクション（承認履歴）
```typescript
{
  id: string,
  applicationId: string,
  stepName: string,
  approverId: string,
  approverName: string,
  action: string,          // "approve", "reject", "circulate"
  comment: string,
  createdAt: timestamp
}
```

## AppSheet経費申請連携

このポータルはGoogle Apps Scriptを介してAppSheetで作成した経費申請アプリと連携し、ポータル上で承認作業を行うことができます。

### 連携アーキテクチャ

```
AppSheet（経費申請アプリ）
    ↓（Apps ScriptがGoogle Sheetsにアクセス）
Google Apps Script（Web APIとして公開）
    ↓（REST API呼び出し）
Approval Portal（Next.js）
```

### 設定手順

#### 1. Google Apps Scriptのデプロイ

詳細な手順は `apps-script/README.md` を参照してください。

1. [Google Apps Script](https://script.google.com/) で新しいプロジェクトを作成
2. `apps-script/Code.gs` の内容をコピーして貼り付け
3. `CONFIG` セクションを更新（スプレッドシートID、シート名、APIキー）
4. Webアプリとしてデプロイ（「全員」がアクセス可能に設定）
5. WebアプリURLをコピー

#### 2. 環境変数の設定

`.env.local` ファイルに以下を追加：

```bash
# Apps Script連携設定
NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/XXXXX/exec
NEXT_PUBLIC_APPS_SCRIPT_API_KEY=YOUR_API_KEY
```

#### 3. Cloudflare Pagesへの環境変数追加

デプロイ先のCloudflare Pagesプロジェクト設定で、以下の環境変数を追加：

```
NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/XXXXX/exec
NEXT_PUBLIC_APPS_SCRIPT_API_KEY=YOUR_API_KEY
```

### 使用方法

1. ダッシュボードの「経費申請」カードをクリック
2. 経費申請一覧が表示される（ステータスでフィルタ可能）
3. 申請をクリックして詳細を表示
4. 「承認する」または「却下する」ボタンで処理

### 注意事項

- AppSheetのデータソース（Google Sheets）の列名は以下を想定しています：
  - `ID`: 申請ID
  - `申請者`: 申請者名
  - `部署`: 部署名
  - `金額`: 金額（数値）
  - `用途`: 用途
  - `申請日`: 申請日
  - `ステータス`: ステータス（申請中、承認済み、却下など）
  - `承認者`: 承認者名
  - `承認日`: 承認日時
  - `承認コメント`: 承認時のコメント
  - `却下理由`: 却下時の理由

- 実際のAppSheetアプリのデータ構造に合わせて、Apps Scriptのコード（`apps-script/Code.gs`）の列名を調整してください
