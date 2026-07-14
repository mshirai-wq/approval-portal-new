// ==========================================
// Approval Portal - AppSheet連携用Google Apps Script（一覧爆速・超軽量化版）
// ==========================================

// 設定
const CONFIG = {
  SPREADSHEET_ID: '19nHu1-SAGU5kgmU4H_NyBhhUjP3UEU_yUL0yg-7Awnc', // 経費申請データが格納されているスプレッドシートID
  SHEET_NAME: '申請データ', // シート名
  API_KEY: 'my-secret-api-key-2026', // API認証用キー
  
  // 大元である「添付資料」フォルダのIDを指定してください
  DRIVE_FOLDER_ID: '1Y1adePzE2joRVbczMb3HRnxM76_yAiv1',
  
  // 情報収集データ用の設定
  INFORMATION_SPREADSHEET_ID: '1GyatBLtrU9o7KP8XTbm-d45vv1LYvmUg4N0eJgW6v2g', // 情報収集データのスプレッドシートID
  INFORMATION_SHEET_NAME: 'お客様の声' // 情報収集データのシート名
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
    if (action === 'getExpense') {
      return createResponse({ expense: getExpense(e) })
    } else if (action === 'getExpenses') {
      return createResponse({ expenses: getExpenses(e) })
    } else if (action === 'getInformations') {
      return createResponse(getInformations(e))
    } else {
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
      case 'confirmInformation':
        return createResponse(confirmInformation(data))
      default:
        return createResponse({ error: 'Invalid action' }, 400)
    }
  } catch (error) {
    return createResponse({ error: error.toString() }, 500)
  }
}

// ==========================================
// OPTIONSメソッド（CORS対応）
// ==========================================

function doOptions(e) {
  const output = ContentService.createTextOutput('')
  output.setMimeType(ContentService.MimeType.JSON)
  return output
}

// ==========================================
// 経費申請データ取得関数
// ==========================================

// ⚡ 一覧取得はドライブ検索を完全に排除して「爆速化」
function getExpenses(e) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  
  const headers = data[0]
  const rows = data.slice(1)
  
  const expenses = rows.map((row, index) => {
    const expense = {}
    headers.forEach((header, i) => {
      expense[header] = row[i]
    })
    expense.rowIndex = index + 2 // 行番号
    return expense // 💡 ドライブ内をループ検索する無駄な処理をすべてカット！
  })
  
  return expenses
}

// 🎯 詳細画面を開いた時だけ「その1件」をピンポイントでドライブ逆引き（1回だけなので超軽量）
function getExpense(e) {
  const id = e.parameter.id
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  
  const headers = data[0]
  const rows = data.slice(1)
  
  const expenseRow = rows.find(row => row[headers.indexOf('申請ID')] === id)
  
  if (!expenseRow) {
    return { error: 'Expense not found' }
  }
  
  const expense = {}
  headers.forEach((header, i) => {
    expense[header] = expenseRow[i]
  })
  
  const filePath = expense['添付資料'];
  if (filePath && typeof filePath === 'string' && filePath.indexOf('添付資料/') === 0) {
    const parts = filePath.split('/');
    const fileName = parts.pop();
    const subFolderName = parts.pop();
    
    try {
      const baseFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      if (subFolderName && fileName) {
        const subFolders = baseFolder.getFoldersByName(subFolderName);
        if (subFolders.hasNext()) {
          const subFolder = subFolders.next();
          const files = subFolder.getFilesByName(fileName);
          if (files.hasNext()) {
            expense['driveFileId'] = files.next().getId(); // 詳細画面の裏側でのみIDを特定
          }
        }
      }
    } catch (err) {
      console.error('詳細プレビュー用のフォルダ検索に失敗しました: ', err);
    }
  }
  
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
  
  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIndex] === id) {
      rowIndex = i + 1
      break
    }
  }
  
  if (rowIndex === -1) {
    return { error: 'Expense not found' }
  }
  
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
  
  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIndex] === id) {
      rowIndex = i + 1
      break
    }
  }
  
  if (rowIndex === -1) {
    return { error: 'Expense not found' }
  }
  
  sheet.getRange(rowIndex, statusIndex + 1).setValue('却下')
  sheet.getRange(rowIndex, approverIndex + 1).setValue(approverName)
  sheet.getRange(rowIndex, approvalDateIndex + 1).setValue(new Date())
  if (commentIndex !== -1 && approverComment) {
    sheet.getRange(rowIndex, commentIndex + 1).setValue(approverComment)
  }
  
  return { success: true, id, status: '却下' }
}

// ==========================================
// 情報収集データ取得関数
// ==========================================

function getInformations(e) {
  const sheet = SpreadsheetApp.openById(CONFIG.INFORMATION_SPREADSHEET_ID).getSheetByName(CONFIG.INFORMATION_SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  
  // ヘッダー行をスキップ
  const headers = data[0]
  const rows = data.slice(1)
  
  // カラムインデックス（F列=顧客ID, G列=現場IDは除外）
  const idIndex = headers.indexOf('ID')
  const datetimeIndex = headers.indexOf('日時')
  const infoDateIndex = headers.indexOf('情報入手日')
  const deptIndex = headers.indexOf('担当者所属')
  const nameIndex = headers.indexOf('担当者氏名')
  const partnerNameIndex = headers.indexOf('相手先氏名')
  const stayTimeIndex = headers.indexOf('滞在時間')
  const commentIndex = headers.indexOf('コメント')
  const customerNameIndex = headers.indexOf('顧客名')
  const siteNameIndex = headers.indexOf('現場名')
  const confirmer1Index = headers.indexOf('確認者1')
  const confirmer2Index = headers.indexOf('確認者2')
  const confirmer3Index = headers.indexOf('確認者3')
  
  // データをオブジェクトに変換（F列、G列を除外）
  const informations = rows.map((row, index) => {
    const reviewers = []
    if (confirmer1Index !== -1 && row[confirmer1Index]) reviewers.push(row[confirmer1Index])
    if (confirmer2Index !== -1 && row[confirmer2Index]) reviewers.push(row[confirmer2Index])
    if (confirmer3Index !== -1 && row[confirmer3Index]) reviewers.push(row[confirmer3Index])
    
    return {
      id: row[idIndex] || `info_${index + 2}`,
      件名: `${row[customerNameIndex] || ''} ${row[siteNameIndex] || ''} ${row[partnerNameIndex] || ''}`.trim(),
      内容: `担当者: ${row[nameIndex] || ''}\n所属: ${row[deptIndex] || ''}\n情報入手日: ${row[infoDateIndex] || ''}\n滞在時間: ${row[stayTimeIndex] || ''}\nコメント: ${row[commentIndex] || ''}`,
      確認担当者: reviewers,
      ステータス: '未確認', // スプレッドシートにステータス列がない場合はデフォルト値
      行番号: index + 2,
      作成日時: row[datetimeIndex] || ''
    }
  })
  
  return { informations }
}

function confirmInformation(data) {
  const { id, approverName } = data
  
  const sheet = SpreadsheetApp.openById(CONFIG.INFORMATION_SPREADSHEET_ID).getSheetByName(CONFIG.INFORMATION_SHEET_NAME)
  const dataRange = sheet.getDataRange()
  const values = dataRange.getValues()
  
  const headers = values[0]
  const idIndex = headers.indexOf('ID')
  
  // IDで検索
  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIndex] === id) {
      rowIndex = i + 1 // 1-indexed
      break
    }
  }
  
  if (rowIndex === -1) {
    return { error: 'Information not found' }
  }
  
  // スプレッドシートにステータス列がない場合は、確認者列に確認済みマークを追加
  const confirmer1Index = headers.indexOf('確認者1')
  const confirmer2Index = headers.indexOf('確認者2')
  const confirmer3Index = headers.indexOf('確認者3')
  
  // 空いている確認者列に承認者名を追加
  const currentConfirmers = []
  if (confirmer1Index !== -1) currentConfirmers.push(values[rowIndex - 1][confirmer1Index])
  if (confirmer2Index !== -1) currentConfirmers.push(values[rowIndex - 1][confirmer2Index])
  if (confirmer3Index !== -1) currentConfirmers.push(values[rowIndex - 1][confirmer3Index])
  
  if (!currentConfirmers.includes(approverName)) {
    if (confirmer1Index !== -1 && !values[rowIndex - 1][confirmer1Index]) {
      sheet.getRange(rowIndex, confirmer1Index + 1).setValue(approverName)
    } else if (confirmer2Index !== -1 && !values[rowIndex - 1][confirmer2Index]) {
      sheet.getRange(rowIndex, confirmer2Index + 1).setValue(approverName)
    } else if (confirmer3Index !== -1 && !values[rowIndex - 1][confirmer3Index]) {
      sheet.getRange(rowIndex, confirmer3Index + 1).setValue(approverName)
    }
  }
  
  return { success: true, id, status: '確認完了' }
}

// ==========================================
// ユーティリティ関数
// ==========================================

function createResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
  output.setMimeType(ContentService.MimeType.JSON)
  return output
}

function testGetExpenses() {
  const result = getExpenses({ parameter: {} })
  Logger.log(JSON.stringify(result))
}
