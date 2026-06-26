'use server'

// ライブラリを使わず、Web標準のcryptoだけでGoogleの認証JWTを作成する関数
async function getGoogleTokenNative(clientEmail: string, privateKeyStr: string) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  let pemContents = privateKeyStr.replace(pemHeader, "").replace(pemFooter, "")
  pemContents = pemContents.replace(/\s+/g, "")

  const binaryDerString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryDerString.length)
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i)
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const header = { alg: "RS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }

  const base64UrlEncode = (obj: any) => {
    const str = btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  }

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    dataToSign
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`

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

// 画面から呼び出されるアップロード関数（Server Action）
export async function uploadToGoogleDriveAction(formData: FormData) {
  try {
    const file = formData.get('file') as File | null
    if (!file) throw new Error('ファイルがありません')

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!clientEmail || !privateKey || !folderId) {
      throw new Error('環境変数が不足しています')
    }

    const accessToken = await getGoogleTokenNative(clientEmail, privateKey)

    // 1. メタデータ送信
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

    if (!metadataRes.ok) throw new Error('Google Driveへの接続に失敗しました(1)')
    const metadataData = await metadataRes.json()
    const fileId = metadataData.id

    // 2. バイナリデータを流し込む
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    })

    if (!uploadRes.ok) throw new Error('Google Driveへの書き込みに失敗しました(2)')

    // 3. 全員閲覧権限を付与
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })

    return {
      success: true,
      name: file.name,
      url: `https://drive.google.com/uc?id=${fileId}&export=view`,
      type: file.type
    }
  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message || '不明なエラー' }
  }
}