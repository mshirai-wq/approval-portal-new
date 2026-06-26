import { NextResponse } from 'next/server'
import { SignJWT, importPKCS8 } from 'jose'

export const runtime = 'edge'

async function getGoogleToken(clientEmail: string, privateKey: string) {
  const alg = 'RS256'
  const key = await importPKCS8(privateKey, alg)
  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)

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

    const accessToken = await getGoogleToken(clientEmail, privateKey)

    // ★Edge環境で最も安全な「FormDataを使ったシンプルな2段階方式」に変更
    // 1. メタデータ（ファイル名と保存先）だけを先に送信して、ファイル枠（ID）を作る
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

    // 2. 作成したファイルIDに対して、中身のバイナリ（データ）だけをパッチ（上書き）する
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file, // バイナリをそのまま流し込む（Edge環境で一番安全な方法）
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      throw new Error(`Google Drive Content Upload Failed: ${errText}`)
    }

    // 3. ファイルの権限を「リンクを知っている全員が閲覧可能」に変更
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