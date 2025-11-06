'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/uiz/use-toast'
import { useTenant } from '@/context/TenantContext'
import {
    getTenantDirectory,
    type TenantDirectoryEntry,
} from '@/lib/tenant-directory'
import type { TenantConfig } from '@/types/tenant'

type TenantContextModalProps = {
    isOpen: boolean
    onClose: () => void
}

export function TenantContextModal({
    isOpen,
    onClose,
}: TenantContextModalProps) {
    const { tenant, switchTenant } = useTenant()
    const { toast } = useToast()
    const [entries, setEntries] = useState<TenantDirectoryEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedTenantId, setSelectedTenantId] = useState<string>('')

    const selectedEntry = useMemo(
        () => entries.find((entry) => entry.tenantId === selectedTenantId),
        [entries, selectedTenantId]
    )

    const loadDirectory = useCallback(async (forceRefresh: boolean = false) => {
        setLoading(true)
        setError(null)
        try {
            const result = await getTenantDirectory({
                forceRefresh,
            })
            setEntries(result)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            setError(message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!isOpen) return
        setSelectedTenantId(tenant?.tenantId ?? '')
        void loadDirectory(false)
    }, [isOpen, tenant?.tenantId, loadDirectory])

    useEffect(() => {
        if (!isOpen) return
        if (selectedTenantId) return
        if (entries.length === 0) return
        setSelectedTenantId(entries[0].tenantId)
    }, [entries, isOpen, selectedTenantId])

    const handleApply = useCallback(async () => {
        if (!selectedTenantId) {
            toast({
                title: 'Choose a tenant',
                description: 'Select a tenant before applying.',
                variant: 'destructive',
            })
            return
        }
        if (tenant?.tenantId === selectedTenantId) {
            toast({
                title: 'Tenant unchanged',
                description: 'The selected tenant is already active.',
            })
            onClose()
            return
        }
        setSubmitting(true)
        try {
            const fallbackConfig: TenantConfig | null = selectedEntry
                ? {
                      tenantId: selectedEntry.tenantId,
                      accountEmail: selectedEntry.accountEmail || '',
                      settingsSpreadsheetId:
                          selectedEntry.settingsSpreadsheetId,
                      menuSpreadsheetId:
                          selectedEntry.menuSpreadsheetId || null,
                      driveFolderId: selectedEntry.driveFolderId || null,
                      metadata: selectedEntry.metadata ?? null,
                      createdAt: selectedEntry.createdAt || Date.now(),
                      updatedAt: selectedEntry.updatedAt || Date.now(),
                  }
                : null
            await switchTenant(selectedTenantId, {
                fallback: fallbackConfig,
            })
            toast({
                title: 'Tenant context updated',
                description: selectedEntry
                    ? `${selectedEntry.label} is now active.`
                    : `Active tenant set to ${selectedTenantId}.`,
            })
            onClose()
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast({
                title: 'Failed to switch tenant',
                description: message,
                variant: 'destructive',
            })
        } finally {
            setSubmitting(false)
        }
    }, [
        onClose,
        selectedEntry,
        selectedTenantId,
        switchTenant,
        tenant?.tenantId,
        toast,
    ])

    const renderBody = () => {
        if (loading && entries.length === 0) {
            return (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Loading tenants…
                </p>
            )
        }
        if (!loading && entries.length === 0) {
            return (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tenant entries were found in the Settings spreadsheet.
                </p>
            )
        }
        return (
            <div className="space-y-2">
                <label
                    htmlFor="tenant-select"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                    Available tenants
                </label>
                <select
                    id="tenant-select"
                    value={selectedTenantId}
                    onChange={(event) =>
                        setSelectedTenantId(event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                >
                    <option value="" disabled>
                        Select a tenant…
                    </option>
                    {entries.map((entry) => (
                        <option key={entry.tenantId} value={entry.tenantId}>
                            {entry.accountEmail
                                ? entry.label &&
                                  entry.label !== entry.accountEmail
                                    ? `${entry.label} · ${entry.accountEmail}`
                                    : entry.accountEmail
                                : `${entry.label} · ${entry.tenantId}`}
                        </option>
                    ))}
                </select>
                {selectedEntry && selectedEntry.accountEmail && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Account email: {selectedEntry.accountEmail}
                    </p>
                )}
                {selectedEntry && selectedEntry.ownerUserId && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        User context: {selectedEntry.ownerUserId}
                    </p>
                )}
            </div>
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (submitting) return
                onClose()
            }}
            className="max-w-lg mx-4"
        >
            <div className="flex flex-col gap-6 p-6 sm:p-8">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Tenant context
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Pick a tenant from the Settings spreadsheet to update
                        your local context.
                    </p>
                </div>
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-300">
                        {error}
                    </div>
                )}
                {renderBody()}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadDirectory(true)}
                        disabled={loading || submitting}
                    >
                        {loading ? 'Refreshing…' : 'Refresh list'}
                    </Button>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleApply}
                            disabled={!selectedTenantId || submitting}
                        >
                            {submitting ? 'Applying…' : 'Apply'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    )
}
