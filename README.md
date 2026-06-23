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
