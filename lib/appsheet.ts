// ==========================================
// Apps Script API クライアント
// ==========================================

const WEB_APP_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_WEB_APP_URL || ''
const API_KEY = process.env.NEXT_PUBLIC_APPS_SCRIPT_API_KEY || ''

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

export interface ExpenseResponse {
  expenses?: Expense[]
  expense?: Expense
  error?: string
  success?: boolean
  status?: string
}

// ==========================================
// API呼び出し関数
// ==========================================

async function callAppsScript(action: string, params?: Record<string, string>): Promise<any> {
  if (!WEB_APP_URL || !API_KEY) {
    throw new Error('Apps Script configuration is missing')
  }

  const url = new URL(WEB_APP_URL)
  url.searchParams.append('action', action)
  url.searchParams.append('apiKey', API_KEY)
  
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
  if (!WEB_APP_URL || !API_KEY) {
    throw new Error('Apps Script configuration is missing')
  }

  const url = new URL(WEB_APP_URL)
  url.searchParams.append('apiKey', API_KEY)

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

export async function getExpenses(status?: string): Promise<Expense[]> {
  const params = status ? { status } : undefined
  const response = await callAppsScript('getExpenses', params)
  
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
