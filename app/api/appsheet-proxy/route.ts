import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')

    const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
    const appsScriptApiKey = process.env.APPS_SCRIPT_API_KEY

    console.log('GET Environment check:', {
      hasUrl: !!appsScriptUrl,
      hasApiKey: !!appsScriptApiKey,
      urlPrefix: appsScriptUrl?.substring(0, 20) + '...'
    })

    // 1. 環境変数がちゃんとCloudflareから渡ってきているかチェック
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

    searchParams.forEach((value, key) => {
      if (key !== 'action') {
        targetUrl.searchParams.set(key, value)
      }
    })

    // 3. GASへリクエスト
    console.log('Fetching GAS URL:', targetUrl.toString())
    const response = await fetch(targetUrl.toString())
    const text = await response.text()
    console.log('GAS response status:', response.status)
    console.log('GAS response text (first 200 chars):', text.substring(0, 200))
    
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

    console.log('POST Environment check:', {
      hasUrl: !!appsScriptUrl,
      hasApiKey: !!appsScriptApiKey,
      urlPrefix: appsScriptUrl?.substring(0, 20) + '...'
    })

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
    console.log('POST GAS response status:', response.status)
    console.log('POST GAS response text (first 200 chars):', text.substring(0, 200))
    
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