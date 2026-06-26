import { NextResponse } from 'next/server'
import { SignJWT, importPKCS8 } from 'jose'

export const runtime = 'edge'

// Googleのアクセストークンを取得する関数
async function getGoogleToken(clientEmail: string, privateKey: string) {
  const alg = 'RS256'
  const key = await importPKCS8(privateKey, alg)
  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file', // ドライブのファイル操作権限
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

    // 1. Google APIのトークンを取得
    const accessToken = await getGoogleToken(clientEmail, privateKey)

    // 2. Google Driveの「multipartアップロード」用のBodyを手動で組み立てる (Edge環境対策)
    const boundary = 'foo_bar_baz'
    const metadata = JSON.stringify({
      name: file.name,
      parents: [folderId],
    })

    const fileBuffer = await file.arrayBuffer()
    const encoder = new TextEncoder()

    const part1 = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`
    )
    const part2 = encoder.encode(`\r\n--${boundary}--` )

    // 全てのバイナリを結合
    const bodyBuffer = new Uint8Array(part1.byteLength + fileBuffer.byteLength + part2.byteLength)
    bodyBuffer.set(new Uint8Array(part1), 0)
    bodyBuffer.set(new Uint8Array(fileBuffer), part1.byteLength)
    bodyBuffer.set(new Uint8Array(part2), part1.byteLength + fileBuffer.byteLength)

    // Googleドライブにアップロード
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBuffer,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      throw new Error(`Google Drive Upload Failed: ${errText}`)
    }

    const uploadData = await uploadRes.json()
    const fileId = uploadData.id

    // 3. 【重要】ポータルでプレビュー表示できるように、ファイルの権限を「リンクを知っている全員が閲覧可能」に変更する
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone', // リンクを知っている全員。もしGoogle Workspaceのドメイン内に制限したい場合は 'domain' にします
      }),
    })

    // ポータルのプレビュー表示やダウンロードで使えるGoogle公式のURL形式
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