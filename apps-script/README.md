# Apps Script デプロイ手順

## 1. Google Apps Scriptプロジェクトの作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を入力（例: `Approval Portal Integration`）

## 2. コードの貼り付け

1. `Code.gs` の内容をコピー
2. Apps Scriptエディタに貼り付け

## 3. 設定の更新

`Code.gs` の `CONFIG` セクションを更新：

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID', // 経費申請データが格納されているスプレッドシートID
  SHEET_NAME: '経費申請', // シート名（実際のシート名に合わせて変更）
  API_KEY: 'YOUR_API_KEY' // 任意のAPIキー（ポータル側と同じものを使用）
}
```

### スプレッドシートIDの取得方法
1. 経費申請データが格納されているGoogleスプレッドシートを開く
2. URLからIDをコピー: `https://docs.google.com/spreadsheets/d/[この部分がID]/edit`

### シート名の確認
1. スプレッドシートの下部タブからシート名を確認
2. AppSheetアプリが使用しているシート名を指定

## 4. Webアプリとしてデプロイ

1. 「デプロイ」→「新しいデプロイ」をクリック
2. 種類: 「ウェブアプリ」を選択
3. 説明: `Approval Portal API` などを入力
4. 実行ユーザー: `自分`
5. アクセスできるユーザー: `全員`（または `リンクを知っている全員`）
6. 「デプロイ」をクリック
7. 表示されるWebアプリURLをコピー

## 5. 権限の許可

初回デプロイ時に権限の許可を求められた場合：
1. 「権限を確認」をクリック
2. Googleアカウントを選択
3. 「Google hasn't verified this app」が表示された場合
   - 「Advanced」→「Go to Approval Portal Integration (unsafe)」をクリック
   - 「Allow」をクリック

## 6. ポータル側の設定

取得したWebアプリURLとAPIキーをポータルの環境変数に設定：

```bash
# .env.local
NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/XXXXX/exec
NEXT_PUBLIC_APPS_SCRIPT_API_KEY=YOUR_API_KEY
```

## 7. テスト

Apps Scriptエディタでテスト関数を実行：

```javascript
testGetExpenses() // 経費申請データの取得テスト
testApproveExpense() // 承認処理のテスト
```

## APIエンドポイント

### GETリクエスト

**経費申請一覧取得**
```
GET {WEB_APP_URL}?action=getExpenses&apiKey={API_KEY}&status={オプション:ステータス}
```

**経費申請詳細取得**
```
GET {WEB_APP_URL}?action=getExpense&apiKey={API_KEY}&id={申請ID}
```

### POSTリクエスト

**承認**
```json
POST {WEB_APP_URL}?apiKey={API_KEY}
{
  "action": "approveExpense",
  "id": "申請ID",
  "approverName": "承認者名",
  "approverComment": "承認コメント（オプション）"
}
```

**却下**
```json
POST {WEB_APP_URL}?apiKey={API_KEY}
{
  "action": "rejectExpense",
  "id": "申請ID",
  "approverName": "承認者名",
  "approverComment": "却下理由（オプション）"
}
```

## 注意事項

- スプレッドシートの列名は以下を想定しています（必要に応じてコードを調整）：
  - `ID`: 申請ID
  - `ステータス`: 申請ステータス（申請中、承認済み、却下など）
  - `承認者`: 承認者名
  - `承認日`: 承認日時
  - `承認コメント`: 承認時のコメント
  - `却下理由`: 却下時の理由

- 実際のAppSheetアプリのデータ構造に合わせて列名を調整してください
