// ==========================================
// Apps Script API クライアント
// ==========================================

// プロキシAPIを使用（CORS回避）
const PROXY_API_URL = '/api/appsheet-proxy'

// ※ セキュリティ向上のため、WEB_APP_URL と API_KEY のバリデーションはサーバー側（プロキシAPI）へ一元化しました。

export interface Expense {
  申請ID: string
  タイムスタンプ: string
  メールアドレス: string
  申請者: string
  事前申請: string
  稟議番号: string
  支払方法: string
  拠点: string
  日付: string
  実行金額: number
  '支払先・注文先': string
  内容: string
  使用部署: string
  経費区分: string
  備考: string
  添付資料: string
  承認者: string
  承認ステータス: string
  承認者メールアドレス: string
  承認コメント: string
  承認日時: string
  [key: string]: any
}

export interface Information {
  id: string
  件名: string
  内容: string
  確認担当者: string[]
  ステータス: '未確認' | '確認完了'
  行番号: number
  作成日時: string
  ID?: string
  日時?: string
  情報入手日?: string
  担当者所属?: string
  担当者氏名?: string
  相手先氏名?: string
  滞在時間?: string
  コメント?: string
  顧客名?: string
  現場名?: string
  確認者1?: string
  確認者2?: string
  確認者3?: string
  [key: string]: any
}

export interface ExpenseResponse {
  expenses?: Expense[]
  expense?: Expense
  error?: string
  success?: boolean
  status?: string
}

export interface InformationResponse {
  informations?: Information[]
  information?: Information
  error?: string
  success?: boolean
  status?: string
}

// ==========================================
// API呼び出し関数
// ==========================================

async function callAppsScript(action: string, params?: Record<string, string>): Promise<any> {
  // ブラウザ側での不要な環境変数チェックを削除し、直接プロキシへ流すようにしました
  const url = new URL(PROXY_API_URL, window.location.origin)
  url.searchParams.append('action', action)
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const response = await fetch(url.toString())
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'API call failed')
  }

  return data
}

async function postAppsScript(data: any): Promise<any> {
  // ブラウザ側での不要な環境変数チェックを削除し、直接プロキシへ流すようにしました
  const url = new URL(PROXY_API_URL, window.location.origin)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'API call failed')
  }

  return result
}

// ==========================================
// 経費申請データ取得
// ==========================================

export async function getExpenses(status?: string, userEmail?: string): Promise<Expense[]> {
  const params: Record<string, string> = {}
  if (status) params.status = status
  if (userEmail) params.userEmail = userEmail
  const response = await callAppsScript('getExpenses', Object.keys(params).length > 0 ? params : undefined)
  
  if (response.error) {
    throw new Error(response.error)
  }

  return response.expenses || []
}

export async function getExpense(id: string): Promise<Expense> {
  const response = await callAppsScript('getExpense', { id })
  
  if (response.error) {
    throw new Error(response.error)
  }

  return response.expense
}

// ==========================================
// 承認・却下
// ==========================================

export async function approveExpense(
  id: string,
  approverName: string,
  approverComment?: string
): Promise<ExpenseResponse> {
  const response = await postAppsScript({
    action: 'approveExpense',
    id,
    approverName,
    approverComment,
  })

  if (response.error) {
    throw new Error(response.error)
  }

  return response
}

export async function rejectExpense(
  id: string,
  approverName: string,
  approverComment?: string
): Promise<ExpenseResponse> {
  const response = await postAppsScript({
    action: 'rejectExpense',
    id,
    approverName,
    approverComment,
  })

  if (response.error) {
    throw new Error(response.error)
  }

  return response
}

// ==========================================
// 情報収集データ取得
// ==========================================

export async function getInformations(userName?: string): Promise<Information[]> {
  const params = userName ? { userName } : undefined
  const response = await callAppsScript('getInformations', params)
  
  if (response.error) {
    throw new Error(response.error)
  }

  return response.informations || []
}

export async function confirmInformation(
  id: string,
  approverName: string,
  comment?: string
): Promise<InformationResponse> {
  const response = await postAppsScript({
    action: 'confirmInformation',
    id,
    approverName,
    comment,
  })

  if (response.error) {
    throw new Error(response.error)
  }

  return response
}