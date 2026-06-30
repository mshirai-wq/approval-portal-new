interface Env {
  APPS_SCRIPT_WEB_APP_URL?: string
  APPS_SCRIPT_API_KEY?: string
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context

  // CORSヘッダーを設定
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  // OPTIONSリクエスト（プリフライト）の処理
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    const apiKey = url.searchParams.get('apiKey')

    // Apps ScriptのURL
    const appsScriptUrl = env.APPS_SCRIPT_WEB_APP_URL || process.env.APPS_SCRIPT_WEB_APP_URL
    const appsScriptApiKey = env.APPS_SCRIPT_API_KEY || process.env.APPS_SCRIPT_API_KEY

    if (!appsScriptUrl || !appsScriptApiKey) {
      return new Response(
        JSON.stringify({ error: 'Apps Script configuration is missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Apps ScriptへのリクエストURLを構築
    const targetUrl = new URL(appsScriptUrl)
    targetUrl.searchParams.set('action', action || '')
    targetUrl.searchParams.set('apiKey', appsScriptApiKey)

    // 他のクエリパラメータを転送
    url.searchParams.forEach((value, key) => {
      if (key !== 'action' && key !== 'apiKey') {
        targetUrl.searchParams.set(key, value)
      }
    })

    // Apps Scriptへのリクエスト
    const targetRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (request.method === 'POST') {
      const body = await request.json()
      targetRequest.headers.set('Content-Type', 'application/json')
      // POSTリクエストのボディをApps Scriptに転送
      // ただし、Apps ScriptのAPIキーは環境変数から使用
      const modifiedBody = { ...body }
      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(modifiedBody),
      })
      const data = await response.json()
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      const response = await fetch(targetRequest)
      const data = await response.json()
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Proxy error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}
