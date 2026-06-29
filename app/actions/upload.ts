'use server'

interface UploadResult {
  success: boolean
  fileId?: string
  fileName?: string
  url?: string
  error?: string
}

export async function uploadToDrive(file: File): Promise<UploadResult> {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return { success: false, error: data.error || 'Upload failed' }
    }

    return {
      success: true,
      fileId: data.fileId,
      fileName: data.fileName,
      url: data.url
    }
  } catch (error) {
    console.error('Error uploading to Drive:', error)
    return { success: false, error: 'Upload failed' }
  }
}
