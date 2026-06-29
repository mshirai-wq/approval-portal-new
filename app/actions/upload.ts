'use server'

export const runtime = 'edge'

interface UploadResult {
  success: boolean
  fileId?: string
  fileName?: string
  url?: string
  error?: string
}

async function generateJWT(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }

  const base64UrlEncode = (str: string) => {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  // Web Crypto APIを使用して署名
  const privateKeyUint8Array = new TextEncoder().encode(privateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyUint8Array,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(dataToSign)
  )

  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )

  return `${dataToSign}.${encodedSignature}`
}

export async function uploadToDrive(file: File): Promise<UploadResult> {
  try {
    // 環境変数の取得
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!clientEmail || !privateKey || !folderId) {
      return { success: false, error: 'Missing required environment variables' }
    }

    // JWTトークンの生成
    const token = await generateJWT(clientEmail, privateKey)

    // アクセストークンの取得
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: token
      })
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      return { success: false, error: 'Failed to get access token' }
    }

    const accessToken = tokenData.access_token

    // ファイルをアップロード
    const fileBuffer = await file.arrayBuffer()
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))

    const metadata = {
      name: file.name,
      parents: [folderId]
    }

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'multipart/related; boundary=boundary'
        },
        body: `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--boundary\r\nContent-Type: ${file.type}\r\n\r\n${base64Data}\r\n--boundary--`
      }
    )

    const uploadData = await uploadResponse.json()

    if (!uploadData.id) {
      return { success: false, error: 'Failed to upload file' }
    }

    // ファイルの共有設定を「リンクを知っている全員が閲覧可能」に設定
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      }
    )

    const url = `https://drive.google.com/uc?id=${uploadData.id}&export=view`

    return {
      success: true,
      fileId: uploadData.id,
      fileName: file.name,
      url
    }
  } catch (error) {
    console.error('Error uploading to Drive:', error)
    return { success: false, error: 'Upload failed' }
  }
}
