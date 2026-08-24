import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')

    const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
    const appsScriptApiKey = process.env.APPS_SCRIPT_API_KEY

    // 1. 環境変数チェック
    if (!appsScriptUrl || !appsScriptApiKey) {
      return NextResponse.json(
        { error: `設定エラー: URLが存在するか(${!!appsScriptUrl})、APIキーが存在するか(${!!appsScriptApiKey})` },
        { status: 500 }
      )
    }

    // 2. URLの形式がおかしくないかチェック（ここで落ちるケースが多いです）
    const targetUrl = new URL(appsScriptUrl.trim())
    targetUrl.searchParams.set('action', action || '')
    targetUrl.searchParams.set('apiKey', appsScriptApiKey.trim())
    // 日本語の文字化け対策
    if (searchParams.has('userName')) {
      targetUrl.searchParams.set('userName', decodeURIComponent(searchParams.get('userName') || ''));
    }
    searchParams.forEach((value, key) => {
      if (key !== 'action') {
        targetUrl.searchParams.set(key, value)
      }
    })

    // 3. GASへリクエスト
    const response = await fetch(targetUrl.toString())
    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      // GAS側がエラー画面（HTML）を返してきた場合
      data = { error: 'GASからの返答がJSONではありません。GASのURLやアクセス権限(全員OKか)を確認してください。', details: text }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    // 予測不能なエラーをすべてここで捕まえる
    return NextResponse.json({ error: `プロキシ内部エラー (GET): ${error.message}` }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
    const appsScriptApiKey = process.env.APPS_SCRIPT_API_KEY

    if (!appsScriptUrl || !appsScriptApiKey) {
      return NextResponse.json(
        { error: `設定エラー: URLが存在するか(${!!appsScriptUrl})、APIキーが存在するか(${!!appsScriptApiKey})` },
        { status: 500 }
      )
    }

    const body = await request.json()
    const targetUrl = new URL(appsScriptUrl.trim())
    targetUrl.searchParams.set('apiKey', appsScriptApiKey.trim())

    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: 'GASからの返答がJSONではありません。GASのURLやアクセス権限(全員OKか)を確認してください。', details: text }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json({ error: `プロキシ内部エラー (POST): ${error.message}` }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}