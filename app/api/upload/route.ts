import { NextResponse } from 'next/server'

export const runtime = 'edge'

// ライブラリを使わず、Web標準のcryptoだけでGoogleの認証JWTを作成する関数
async function getGoogleTokenWithoutLibrary(clientEmail: string, privateKeyStr: string) {
  // PEM形式の鍵文字列からヘッダーとフッター、改行を除去して純粋なBase64にする
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  let pemContents = privateKeyStr.replace(pemHeader, "").replace(pemFooter, "")
  pemContents = pemContents.replace(/\s+/g, "")

  // Base64をバイナリ配列にデコード
  const binaryDerString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryDerString.length)
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i)
  }

  // Web Crypto APIで秘密鍵としてインポート
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  // JWTのヘッダーとクレームを構築
  const header = { alg: "RS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }

  // Base64URLエンコード関数
  const base64UrlEncode = (obj: any) => {
    const str = btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  };

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)

  // 署名の実行
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    dataToSign
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`

  // Googleのトークンエンドポイントへリクエスト
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  return data.access_token
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!clientEmail || !privateKey || !folderId) {
      throw new Error('環境変数が不足しています')
    }

    // 外部ライブラリに依存しない方法でトークンを取得
    const accessToken = await getGoogleTokenWithoutLibrary(clientEmail, privateKey)

    // 1. メタデータだけを先に送信してファイルIDを確保
    const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: file.name,
        parents: [folderId],
      }),
    })

    if (!metadataRes.ok) {
      const errText = await metadataRes.text()
      throw new Error(`Google Drive Metadata Failed: ${errText}`)
    }

    const metadataData = await metadataRes.json()
    const fileId = metadataData.id

    // 2. 確保したファイルIDに対してバイナリデータを流し込む
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      throw new Error(`Google Drive Content Upload Failed: ${errText}`)
    }

    // 3. 全員閲覧権限を付与
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    })

    const previewUrl = `https://drive.google.com/uc?id=${fileId}&export=view`

    return NextResponse.json({
      name: file.name,
      url: previewUrl,
      fileId: fileId,
      type: file.type
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}