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
  INFORMATION_SHEET_NAME: 'お客様の声', // 情報収集データのシート名
  EMPLOYEE_MASTER_SHEET_NAME: '社員マスタ', // 社員マスタのシート名
  REVIEW_SHEET_NAME: '確認履歴' // 確認履歴のシート名
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
// ユーティリティ関数（情報収集用）
// ==========================================

// スプレッドシートを共通でオープンする関数
function openInformationSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.INFORMATION_SPREADSHEET_ID)
}

// 社員マスタから社員ID→氏名のマッピングを作成
function createEmployeeIdToNameMap() {
  const employeeMap = {}
  try {
    const sheet = openInformationSpreadsheet().getSheetByName(CONFIG.EMPLOYEE_MASTER_SHEET_NAME)
    if (sheet) {
      const data = sheet.getDataRange().getValues()
      const headers = data[0]
      const rows = data.slice(1)
      
      const idIndex = headers.indexOf('社員ID')
      const nameIndex = headers.indexOf('氏名')
      
      if (idIndex !== -1 && nameIndex !== -1) {
        rows.forEach(row => {
          const empId = row[idIndex]
          const empName = row[nameIndex]
          if (empId && empName) {
            employeeMap[String(empId)] = empName
          }
        })
      }
    }
  } catch (err) {
    console.error('社員マスタの読み込みに失敗しました: ', err)
  }
  return employeeMap
}

// 社員マスタから氏名→社員IDの逆マッピングを作成
function createEmployeeNameToIdMap() {
  const nameToIdMap = {}
  try {
    const sheet = openInformationSpreadsheet().getSheetByName(CONFIG.EMPLOYEE_MASTER_SHEET_NAME)
    if (sheet) {
      const data = sheet.getDataRange().getValues()
      const headers = data[0]
      const rows = data.slice(1)
      
      const idIndex = headers.indexOf('社員ID')
      const nameIndex = headers.indexOf('氏名')
      
      if (idIndex !== -1 && nameIndex !== -1) {
        rows.forEach(row => {
          const empId = row[idIndex]
          const empName = row[nameIndex]
          if (empId && empName) {
            nameToIdMap[String(empName)] = String(empId)
          }
        })
      }
    }
  } catch (err) {
    console.error('社員マスタの読み込みに失敗しました: ', err)
  }
  return nameToIdMap
}

// ==========================================
// 情報収集データ取得関数
// ==========================================

function getInformations(e) {
  const userName = e.parameter.userName // フロントエンドからユーザー名を受け取る
  
  // スプレッドシートをオープン
  const spreadsheet = openInformationSpreadsheet()
  
  // 社員マスタを読み込んで社員ID→氏名のマッピングを作成
  const employeeMap = createEmployeeIdToNameMap()
  
  // ユーザー名から社員IDを特定
  const nameToIdMap = createEmployeeNameToIdMap()
  const userEmployeeId = userName ? nameToIdMap[userName] : null
  
  // 「お客様の声」シートを読み込み
  const infoSheet = spreadsheet.getSheetByName(CONFIG.INFORMATION_SHEET_NAME)
  const infoData = infoSheet.getDataRange().getValues()
  const infoHeaders = infoData[0]
  const infoRows = infoData.slice(1)
  
  // 「確認履歴」シートを読み込み
  const reviewSheet = spreadsheet.getSheetByName(CONFIG.REVIEW_SHEET_NAME)
  const reviewData = reviewSheet.getDataRange().getValues()
  const reviewHeaders = reviewData[0]
  const reviewRows = reviewData.slice(1)
  
  // 確認履歴のインデックス
  const reviewReportIdIndex = reviewHeaders.indexOf('報告ID')
  const reviewReviewerIdIndex = reviewHeaders.indexOf('確認上司')
  const reviewStatusIndex = reviewHeaders.indexOf('ステータス')
  
  // 確認履歴をマップ化（報告ID → 該当ユーザーの確認済みレコード）
  const reviewMap = {}
  if (userEmployeeId && reviewReportIdIndex !== -1 && reviewReviewerIdIndex !== -1 && reviewStatusIndex !== -1) {
    reviewRows.forEach(row => {
      const reportId = row[reviewReportIdIndex]
      const reviewerId = String(row[reviewReviewerIdIndex])
      const status = row[reviewStatusIndex]
      
      if (reviewerId === userEmployeeId && status === '確認済') {
        reviewMap[String(reportId)] = true
      }
    })
  }
  
  // カラムインデックス（F列=顧客ID, G列=現場IDは除外）
  const idIndex = infoHeaders.indexOf('ID')
  const datetimeIndex = infoHeaders.indexOf('日時')
  const infoDateIndex = infoHeaders.indexOf('情報入手日')
  const deptIndex = infoHeaders.indexOf('担当者所属')
  const nameIndex = infoHeaders.indexOf('担当者氏名')
  const partnerNameIndex = infoHeaders.indexOf('相手先氏名')
  const stayTimeIndex = infoHeaders.indexOf('滞在時間')
  const commentIndex = infoHeaders.indexOf('コメント')
  const customerNameIndex = infoHeaders.indexOf('顧客名')
  const siteNameIndex = infoHeaders.indexOf('現場名')
  const confirmer1Index = infoHeaders.indexOf('確認者1')
  const confirmer2Index = infoHeaders.indexOf('確認者2')
  const confirmer3Index = infoHeaders.indexOf('確認者3')
  
  // データをオブジェクトに変換（F列、G列を除外）
  const informations = infoRows.map((row, index) => {
    const reportId = row[idIndex] || `info_${index + 2}`
    const reviewers = []
    
    // 社員IDを氏名に変換
    if (confirmer1Index !== -1 && row[confirmer1Index]) {
      const empId = String(row[confirmer1Index])
      reviewers.push(employeeMap[empId] || empId)
    }
    if (confirmer2Index !== -1 && row[confirmer2Index]) {
      const empId = String(row[confirmer2Index])
      reviewers.push(employeeMap[empId] || empId)
    }
    if (confirmer3Index !== -1 && row[confirmer3Index]) {
      const empId = String(row[confirmer3Index])
      reviewers.push(employeeMap[empId] || empId)
    }
    
    // 確認履歴からステータスを判定
    const isConfirmed = reviewMap[String(reportId)]
    const status = isConfirmed ? '確認済' : '未確認'
    
    const title = `${row[customerNameIndex] || ''} ${row[siteNameIndex] || ''} ${row[partnerNameIndex] || ''}`.trim()
    
    return {
      id: reportId,
      title: title, // フロントエンドが期待するtitleキー
      件名: title,
      内容: `担当者: ${row[nameIndex] || ''}\n所属: ${row[deptIndex] || ''}\n情報入手日: ${row[infoDateIndex] || ''}\n滞在時間: ${row[stayTimeIndex] || ''}\nコメント: ${row[commentIndex] || ''}`,
      確認担当者: reviewers,
      reviewers: reviewers, // フロントエンドが期待するreviewersキー
      ステータス: status,
      行番号: index + 2,
      作成日時: row[datetimeIndex] || ''
    }
  })
  
  return { informations }
}

function confirmInformation(data) {
  const { id, approverName, comment } = data
  
  // スプレッドシートをオープン
  const spreadsheet = openInformationSpreadsheet()
  
  // 氏名を社員IDに逆変換
  const nameToIdMap = createEmployeeNameToIdMap()
  const approverId = nameToIdMap[approverName] || approverName
  
  // 「確認履歴」シートを読み込み
  const reviewSheet = spreadsheet.getSheetByName(CONFIG.REVIEW_SHEET_NAME)
  const reviewData = reviewSheet.getDataRange().getValues()
  const reviewHeaders = reviewData[0]
  const reviewRows = reviewData.slice(1)
  
  // 確認履歴のインデックス
  const reviewIdIndex = reviewHeaders.indexOf('確認ID')
  const reviewReportIdIndex = reviewHeaders.indexOf('報告ID')
  const reviewReviewerIdIndex = reviewHeaders.indexOf('確認上司')
  const reviewStatusIndex = reviewHeaders.indexOf('ステータス')
  const reviewCommentIndex = reviewHeaders.indexOf('上司コメント')
  const reviewDateTimeIndex = reviewHeaders.indexOf('確認日時')
  const reviewTransferIndex = reviewHeaders.indexOf('転送先')
  
  // 該当する行を検索（報告IDが一致、確認上司が自分の社員ID、ステータスが未確認）
  let targetRowIndex = -1
  for (let i = 0; i < reviewRows.length; i++) {
    const row = reviewRows[i]
    const reportId = row[reviewReportIdIndex]
    const reviewerId = String(row[reviewReviewerIdIndex])
    const status = row[reviewStatusIndex]
    
    if (String(reportId) === String(id) && reviewerId === approverId && status === '未確認') {
      targetRowIndex = i + 2 // 1-indexed（ヘッダー行を考慮）
      break
    }
  }
  
  if (targetRowIndex !== -1) {
    // 該当行が存在する場合は更新
    reviewSheet.getRange(targetRowIndex, reviewStatusIndex + 1).setValue('確認済')
    reviewSheet.getRange(targetRowIndex, reviewCommentIndex + 1).setValue(comment || '')
    reviewSheet.getRange(targetRowIndex, reviewDateTimeIndex + 1).setValue(new Date())
  } else {
    // 該当行が存在しない場合は新規追加
    const newReviewId = `review_${id}_${approverId}_${Date.now()}`
    reviewSheet.appendRow([
      newReviewId,
      id,
      approverId,
      '確認済',
      comment || '',
      new Date(),
      ''
    ])
  }
  
  return { success: true, id, status: '確認済' }
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
