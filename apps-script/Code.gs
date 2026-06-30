// ==========================================
// Approval Portal - AppSheet連携用Google Apps Script
// ==========================================

// 設定
const CONFIG = {
  // AppSheetアプリのデータソース（Google SheetsのURL）
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID', // 経費申請データが格納されているスプレッドシートID
  SHEET_NAME: '経費申請', // シート名
  API_KEY: 'YOUR_API_KEY' // API認証用キー
}

// ==========================================
// Web APIエンドポイント
// ==========================================

function doGet(e) {
  const action = e.parameter.action
  const apiKey = e.parameter.apiKey

  if (apiKey !== CONFIG.API_KEY) {
    return createResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    switch (action) {
      case 'getExpenses':
        return createResponse(getExpenses(e))
      case 'getExpense':
        return createResponse(getExpense(e))
      default:
        return createResponse({ error: 'Invalid action' }, 400)
    }
  } catch (error) {
    return createResponse({ error: error.toString() }, 500)
  }
}

function doPost(e) {
  const apiKey = e.parameter.apiKey

  if (apiKey !== CONFIG.API_KEY) {
    return createResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const data = JSON.parse(e.postData.contents)
    const action = data.action

    switch (action) {
      case 'approveExpense':
        return createResponse(approveExpense(data))
      case 'rejectExpense':
        return createResponse(rejectExpense(data))
      default:
        return createResponse({ error: 'Invalid action' }, 400)
    }
  } catch (error) {
    return createResponse({ error: error.toString() }, 500)
  }
}

// ==========================================
// 経費申請データ取得関数
// ==========================================

function getExpenses(e) {
  const status = e.parameter.status // オプション: 承認ステータスでフィルタ
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  
  // ヘッダー行をスキップ
  const headers = data[0]
  const rows = data.slice(1)
  
  // データをオブジェクトに変換
  const expenses = rows.map((row, index) => {
    const expense = {}
    headers.forEach((header, i) => {
      expense[header] = row[i]
    })
    expense.rowIndex = index + 2 // 行番号（1-indexed、ヘッダー行を考慮）
    return expense
  })
  
  // ステータスでフィルタ（承認ステータス列を使用）
  if (status) {
    return expenses.filter(exp => exp['承認ステータス'] === status)
  }
  
  return expenses
}

function getExpense(e) {
  const id = e.parameter.id
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  
  const headers = data[0]
  const rows = data.slice(1)
  
  // IDで検索（申請ID列を使用）
  const expenseRow = rows.find(row => row[headers.indexOf('申請ID')] === id)
  
  if (!expenseRow) {
    return { error: 'Expense not found' }
  }
  
  const expense = {}
  headers.forEach((header, i) => {
    expense[header] = expenseRow[i]
  })
  
  return expense
}

// ==========================================
// 承認・却下関数
// ==========================================

function approveExpense(data) {
  const { id, approverName, approverComment } = data
  
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const dataRange = sheet.getDataRange()
  const values = dataRange.getValues()
  
  const headers = values[0]
  const idIndex = headers.indexOf('申請ID')
  const statusIndex = headers.indexOf('承認ステータス')
  const approverIndex = headers.indexOf('承認者')
  const approvalDateIndex = headers.indexOf('承認日時')
  const commentIndex = headers.indexOf('承認コメント')
  
  // IDで検索
  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIndex] === id) {
      rowIndex = i + 1 // 1-indexed
      break
    }
  }
  
  if (rowIndex === -1) {
    return { error: 'Expense not found' }
  }
  
  // ステータスを更新
  sheet.getRange(rowIndex, statusIndex + 1).setValue('承認済み')
  sheet.getRange(rowIndex, approverIndex + 1).setValue(approverName)
  sheet.getRange(rowIndex, approvalDateIndex + 1).setValue(new Date())
  if (commentIndex !== -1 && approverComment) {
    sheet.getRange(rowIndex, commentIndex + 1).setValue(approverComment)
  }
  
  return { success: true, id, status: '承認済み' }
}

function rejectExpense(data) {
  const { id, approverName, approverComment } = data
  
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const dataRange = sheet.getDataRange()
  const values = dataRange.getValues()
  
  const headers = values[0]
  const idIndex = headers.indexOf('申請ID')
  const statusIndex = headers.indexOf('承認ステータス')
  const approverIndex = headers.indexOf('承認者')
  const approvalDateIndex = headers.indexOf('承認日時')
  const commentIndex = headers.indexOf('承認コメント')
  
  // IDで検索
  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIndex] === id) {
      rowIndex = i + 1 // 1-indexed
      break
    }
  }
  
  if (rowIndex === -1) {
    return { error: 'Expense not found' }
  }
  
  // ステータスを更新
  sheet.getRange(rowIndex, statusIndex + 1).setValue('却下')
  sheet.getRange(rowIndex, approverIndex + 1).setValue(approverName)
  sheet.getRange(rowIndex, approvalDateIndex + 1).setValue(new Date())
  if (commentIndex !== -1 && approverComment) {
    sheet.getRange(rowIndex, commentIndex + 1).setValue(approverComment)
  }
  
  return { success: true, id, status: '却下' }
}

// ==========================================
// ユーティリティ関数
// ==========================================

function createResponse(data, statusCode = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

// ==========================================
// テスト関数（開発用）
// ==========================================

function testGetExpenses() {
  const result = getExpenses({ parameter: {} })
  Logger.log(JSON.stringify(result))
}

function testApproveExpense() {
  const result = approveExpense({
    id: 'TEST-001',
    approverName: 'テスト承認者',
    approverComment: 'テストコメント'
  })
  Logger.log(JSON.stringify(result))
}
