// Client-side helper to upload an image receipt to Google Drive via GAS
// Expects the Apps Script to handle action 'uploadReceipt' and return { ok: true, fileId, webViewLink, webContentLink, url }

export type UploadReceiptResult = {
    ok: boolean
    fileId?: string
    url?: string
    webViewLink?: string
    webContentLink?: string
    error?: string
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const result = reader.result as string
                const base64 = result.split(',')[1] || result
                resolve(base64)
            } catch (e) {
                reject(e)
            }
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
}

export async function uploadReceiptToDrive(
    file: File,
    folderHint?: string
): Promise<UploadReceiptResult> {
    try {
        const dataBase64 = await fileToBase64(file)
        const payload = {
            action: 'uploadReceipt',
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataBase64,
            ...(folderHint ? { folderHint } : {}),
        }
        const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const json = (await res.json().catch(() => ({}))) as any
        if (!res.ok || json?.ok === false) {
            return { ok: false, error: String(json?.error || res.statusText) }
        }
        // Prefer an explicit url if provided, otherwise fall back to webViewLink/webContentLink
        const url: string | undefined =
            json.url || json.webViewLink || json.webContentLink
        return {
            ok: true,
            fileId: json.fileId,
            url,
            webViewLink: json.webViewLink,
            webContentLink: json.webContentLink,
        }
    } catch (error) {
        return { ok: false, error: String((error as Error)?.message || error) }
    }
}
