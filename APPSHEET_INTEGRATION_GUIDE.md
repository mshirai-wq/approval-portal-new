# AppSheet経費申請連携 - 初心者向け詳細手順

このガイドでは、AppSheetで作成した経費申請アプリをapproval-portalに連携して、ポータル上で承認作業を行えるようにする手順を初心者向けに詳しく説明します。

## 目次

1. [事前準備](#事前準備)
2. [Google Apps Scriptのデプロイ](#google-apps-scriptのデプロイ)
3. [ポータルの環境変数設定](#ポータルの環境変数設定)
4. [動作確認](#動作確認)
5. [トラブルシューティング](#トラブルシューティング)

---

## 事前準備

### 必要なもの

- Googleアカウント（Apps Scriptを使用するため）
- AppSheet経費申請アプリのデータが格納されているGoogleスプレッドシート
- スプレッドシートへのアクセス権限

### スプレッドシート情報の確認

1. 経費申請データが格納されているGoogleスプレッドシートを開く
2. URLからスプレッドシートIDをコピーする

   URLの形式: `https://docs.google.com/spreadsheets/d/[この部分がID]/edit`
   
   例: `https://docs.google.com/spreadsheets/d/1ABC123xyz456/edit` の場合、IDは `1ABC123xyz456`

3. シート名（タブの名前）を確認する
   - 通常は「経費申請」や「Sheet1」など

---

## Google Apps Scriptのデプロイ

### ステップ1: Google Apps Scriptプロジェクトの作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. Googleアカウントでログイン
3. 左上の「新しいプロジェクト」をクリック
4. プロジェクト名を入力（例: `Approval Portal Integration`）
5. 「作成」をクリック

### ステップ2: コードの貼り付け

1. プロジェクトが作成されると、コードエディタが開きます
2. 左側の「エディタ」にある `コード.gs` をクリック
3. 既存のコードをすべて削除
4. `approval-portal/apps-script/Code.gs` の内容をコピー
5. エディタに貼り付け

### ステップ3: 設定の更新

コードの上部にある `CONFIG` セクションを、あなたの環境に合わせて更新します。

```javascript
const CONFIG = {
  // スプレッドシートID（事前準備でコピーしたID）
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  
  // シート名（スプレッドシートのタブ名）
  SHEET_NAME: '経費申請',
  
  // APIキー（任意の文字列、ポータル側と同じものを使用）
  API_KEY: 'YOUR_API_KEY'
}
```

**設定例:**
```javascript
const CONFIG = {
  SPREADSHEET_ID: '1ABC123xyz456',
  SHEET_NAME: '経費申請',
  API_KEY: 'my-secret-api-key-2024'
}
```

### ステップ4: テスト実行（オプション）

デプロイ前に、コードが正しく動作するかテストできます。

1. エディタ上部の関数選択ドロップダウンから `testGetExpenses` を選択
2. 「実行」ボタンをクリック
3. 初回実行時は権限の許可を求められます（後述）
4. 実行ログを確認（下部の「実行ログ」タブ）

**権限の許可手順（初回のみ）:**

1. 「権限を確認」をクリック
2. Googleアカウントを選択
3. 以下の警告が表示された場合:
   - 「Google hasn't verified this app」という警告
   - 「Advanced（詳細）」をクリック
   - 「Go to Approval Portal Integration (unsafe)」をクリック
   - 「Allow（許可）」をクリック

### ステップ5: Webアプリとしてデプロイ

1. エディタ右上の「デプロイ」をクリック
2. 「新しいデプロイ」をクリック
3. 以下の設定を行います:

   **デプロイの設定:**
   - 種類: 「ウェブアプリ」を選択
   
   **説明:**
   - 説明: `Approval Portal API` など任意の説明を入力
   
   **実行ユーザー:**
   - 「自分」を選択
   
   **アクセスできるユーザー:**
   - 「全員」を選択（重要: ポータルからアクセスするため）

4. 「デプロイ」をクリック
5. デプロイが完了すると、WebアプリURLが表示されます
6. このURLをコピーして保存します（後で使用します）

**WebアプリURLの例:**
```
https://script.google.com/macros/s/AKfycbx.../exec
```

### ステップ6: デプロイの更新（コード修正時）

コードを修正した後は、以下の手順でデプロイを更新します:

1. 「デプロイ」→「デプロイを管理」をクリック
2. 該当するデプロイの「編集」アイコン（鉛筆マーク）をクリック
3. 「新バージョン」を選択
4. 説明を更新（例: `Update column names`）
5. 「デプロイ」をクリック

---

## ポータルの環境変数設定

### ステップ1: ローカル開発環境の設定

1. `approval-portal` プロジェクトのルートディレクトリに移動
2. `.env.local` ファイルを開く（存在しない場合は作成）
3. 以下の環境変数を追加:

```bash
# Apps Script連携設定
NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfycbx.../exec
NEXT_PUBLIC_APPS_SCRIPT_API_KEY=my-secret-api-key-2024
```

**注意点:**
- `NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL`: デプロイ時にコピーしたWebアプリURL
- `NEXT_PUBLIC_APPS_SCRIPT_API_KEY`: Apps ScriptのCONFIGで設定したAPIキーと同じもの

### ステップ2: Cloudflare Pagesへの環境変数追加（本番環境）

本番環境（Cloudflare Pages）でも環境変数を設定する必要があります。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にアクセス
2. 「Workers & Pages」→「approval-portal」プロジェクトを選択
3. 「Settings」→「Functions」→「Environment variables」
4. 以下の環境変数を追加:

   **Production環境:**
   - Variable name: `NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL`
   - Value: WebアプリURL
   - 「Add variable」をクリック
   
   - Variable name: `NEXT_PUBLIC_APPS_SCRIPT_API_KEY`
   - Value: APIキー
   - 「Add variable」をクリック

5. 必要に応じてPreview環境にも同じ環境変数を追加

### ステップ3: 環境変数の確認

環境変数が正しく設定されているか確認します。

**ローカル環境:**
```bash
# .env.localファイルを確認
cat .env.local
```

**本番環境:**
- Cloudflare Dashboardで環境変数が表示されていることを確認

---

## 動作確認

### ステップ1: ローカル開発サーバーの起動

1. ターミナルで `approval-portal` ディレクトリに移動
2. 以下のコマンドを実行:

```bash
npm run dev
```

3. ブラウザで `http://localhost:3000` にアクセス
4. ログインする

### ステップ2: 経費申請一覧の確認

1. ダッシュボードの「経費申請」カードをクリック
2. 経費申請一覧が表示されることを確認
3. ステータスフィルター（申請中、承認済み、却下）が動作することを確認
4. 検索機能が動作することを確認

### ステップ3: 経費申請詳細の確認

1. 任意の経費申請をクリック
2. 詳細情報が正しく表示されることを確認
3. 申請ID、申請者、日付、内容、金額などが表示されていることを確認

### ステップ4: 承認・却下機能の確認

1. ステータスが「申請中」の経費申請を開く
2. コメントを入力（オプション）
3. 「承認する」ボタンをクリック
4. ステータスが「承認済み」に変わることを確認
5. 承認者、承認日時、コメントが記録されていることを確認
6. 同様に「却下する」もテスト

---

## トラブルシューティング

### エラー: 「Apps Script configuration is missing」

**原因:** 環境変数が設定されていない

**解決策:**
1. `.env.local` ファイルを確認
2. `NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL` と `NEXT_PUBLIC_APPS_SCRIPT_API_KEY` が設定されているか確認
3. ファイルを保存後、開発サーバーを再起動

### エラー: 「Unauthorized」

**原因:** APIキーが一致していない

**解決策:**
1. Apps Scriptの `CONFIG.API_KEY` とポータルの `NEXT_PUBLIC_APPS_SCRIPT_API_KEY` が一致しているか確認
2. 一致していない場合は、同じ値に設定し直す

### エラー: 「Expense not found」

**原因:** 指定された申請IDが見つからない

**解決策:**
1. スプレッドシートにデータ是否存在するか確認
2. 申請ID列（「申請ID」）の値が正しいか確認

### エラー: 「経費申請データの取得に失敗しました」

**原因:** Apps ScriptのWebアプリURLが間違っている、またはアクセス権限の問題

**解決策:**
1. WebアプリURLが正しいか確認（末尾が `/exec` で終わっているか）
2. Apps Scriptのデプロイ設定で「アクセスできるユーザー」が「全員」になっているか確認
3. 必要に応じてデプロイを更新

### データが表示されない

**原因:** スプレッドシートの列名がコードと一致していない

**解決策:**
1. スプレッドシートのヘッダー行を確認
2. 以下の列名が存在するか確認:
   - 申請ID
   - タイムスタンプ
   - メールアドレス
   - 申請者
   - 事前申請
   - 稟議番号
   - 支払方法
   - 拠点
   - 日付
   - 実行金額
   - 支払先・注文先
   - 内容
   - 使用部署
   - 経費区分
   - 備考
   - 添付資料
   - 承認者
   - 承認ステータス
   - 承認者メールアドレス
   - 承認コメント
   - 承認日時

3. 列名が異なる場合は、Apps Scriptコード（`apps-script/Code.gs`）の列名を修正

### CORSエラー

**原因:** ブラウザのCORSポリシーによる制限

**解決策:**
1. Apps ScriptのWebアプリURLが正しいか確認
2. デプロイ設定で「アクセスできるユーザー」が「全員」になっているか確認
3. 必要に応じてデプロイを更新

---

## まとめ

1. **Apps Scriptのデプロイ**: Google Apps Scriptでコードを貼り付け、設定を更新し、Webアプリとしてデプロイ
2. **環境変数の設定**: ローカル環境と本番環境（Cloudflare Pages）にWebアプリURLとAPIキーを設定
3. **動作確認**: 経費申請一覧、詳細表示、承認・却下機能をテスト

不明な点がある場合は、`apps-script/README.md` も参照してください。
