export interface Env {
  GOOGLE_CLIENT_EMAIL: string
  GOOGLE_PRIVATE_KEY: string
  GOOGLE_DRIVE_FOLDER_ID: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    try {
      const formData = await request.formData()
      const file = formData.get('file') as File

      if (!file) {
        return new Response(JSON.stringify({ success: false, error: 'No file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const clientEmail = env.GOOGLE_CLIENT_EMAIL
      const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      const folderId = env.GOOGLE_DRIVE_FOLDER_ID

      if (!clientEmail || !privateKey || !folderId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required environment variables' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const token = await generateJWT(clientEmail, privateKey)

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: token
        })
      })

      const tokenData = await tokenResponse.json()
      
      if (!tokenData.access_token) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to get access token' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const accessToken = tokenData.access_token

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
        return new Response(JSON.stringify({ success: false, error: 'Failed to upload file' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

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

      return new Response(JSON.stringify({
        success: true,
        fileId: uploadData.id,
        fileName: file.name,
        url
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error uploading to Drive:', error)
      return new Response(JSON.stringify({ success: false, error: 'Upload failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}

async function generateJWT(clientEmail: string, privateKey: string): Promise<string> {
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
