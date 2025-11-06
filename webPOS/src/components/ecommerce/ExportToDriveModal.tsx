'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import Button from '@/components/ui/button/Button'
import { uploadDailyExport } from '@/lib/export/upload'
import { useToast } from '@/components/uiz/use-toast'

type Props = {
    open: boolean
    onClose: () => void
}

export default function ExportToDriveModal({ open, onClose }: Props) {
    const { toast } = useToast()
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<string[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const doExport = async () => {
        try {
            setBusy(true)
            setError(null)
            const res = await uploadDailyExport()
            setResult(res.uploaded)
            toast({
                title: 'Export complete',
                description: `${res.uploaded.length} file(s) uploaded`,
            })
        } catch (e: any) {
            const msg = e?.message || String(e)
            setError(msg)
            toast({
                title: 'Export failed',
                description: msg,
                variant: 'destructive',
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-lg p-6">
            <div className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold" id="export-title">
                        Export to Drive
                    </h2>
                    <p className="text-sm text-gray-500" id="export-desc">
                        Create and upload CSV exports for tickets, items,
                        inventory events, and shifts.
                    </p>
                </div>
                {result && (
                    <div className="rounded-md border p-3 text-sm dark:border-gray-800">
                        <div className="font-medium mb-1">Uploaded</div>
                        <ul className="list-disc pl-5">
                            {result.map((name) => (
                                <li key={name}>{name}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                        {error}
                    </div>
                )}
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        onClick={doExport}
                        disabled={busy}
                    >
                        {busy ? 'Exporting…' : 'Export to Drive now'}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
