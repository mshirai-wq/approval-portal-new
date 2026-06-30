import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const action = searchParams.get('action')

  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
  const appsScriptApiKey = process.env.APPS_SCRIPT_API_KEY

  if (!appsScriptUrl || !appsScriptApiKey) {
    return NextResponse.json(
      { error: 'Apps Script configuration is missing' },
      { status: 500 }
    )
  }

  // Apps ScriptへのリクエストURLを構築
  const targetUrl = new URL(appsScriptUrl)
  targetUrl.searchParams.set('action', action || '')
  targetUrl.searchParams.set('apiKey', appsScriptApiKey)

  // 他のクエリパラメータを転送
  searchParams.forEach((value, key) => {
    if (key !== 'action') {
      targetUrl.searchParams.set(key, value)
    }
  })

  try {
    const response = await fetch(targetUrl.toString())
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text || 'Invalid response from Apps Script' }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Proxy error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
  const appsScriptApiKey = process.env.APPS_SCRIPT_API_KEY

  if (!appsScriptUrl || !appsScriptApiKey) {
    return NextResponse.json(
      { error: 'Apps Script configuration is missing' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    // Apps ScriptへのリクエストURLを構築
    const targetUrl = new URL(appsScriptUrl)
    targetUrl.searchParams.set('apiKey', appsScriptApiKey)

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
      data = { error: text || 'Invalid response from Apps Script' }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Proxy error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
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
