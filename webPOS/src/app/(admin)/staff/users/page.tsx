'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import {
    listUsersLocal,
    syncAllUsersFromRemote,
    upsertUserLocal,
    type UserProfile,
} from '@/lib/local-users'
import { enqueue } from '@/lib/sync-queue'
import { pageStaffMember } from '@/lib/local-pos'

type EditableUser = {
    pin: string
    role: string
    name: string
    email: string
    phone: string
    notes: string
}

const ROLES = ['admin', 'limited']
const PAGER_PRESETS = [
    'Order ready at the kitchen pass.',
    'Order ready at the bar.',
    'Guest needs assistance on the floor.',
]

export default function StaffUsersPage() {
    const [users, setUsers] = useState<EditableUser[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [form, setForm] = useState<EditableUser | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [pagerOpen, setPagerOpen] = useState(false)
    const [pagerTarget, setPagerTarget] = useState<EditableUser | null>(null)
    const [pagerMessage, setPagerMessage] = useState('Order ready at the pass.')
    const [pagerSending, setPagerSending] = useState(false)
    const [pagerError, setPagerError] = useState<string | null>(null)

    const applyUsers = useCallback((rows: UserProfile[]) => {
        setUsers(
            rows.map((r) => ({
                pin: r.id,
                role: String(r.role || 'limited'),
                name: r.name || '',
                email: r.email || '',
                phone: r.phone || '',
                notes: r.notes || '',
            }))
        )
    }, [])

    const loadLocal = useCallback(async () => {
        const rows = await listUsersLocal()
        applyUsers(rows)
    }, [applyUsers])

    useEffect(() => {
        let alive = true
        ;(async () => {
            const local = await listUsersLocal()
            if (alive) applyUsers(local)
            try {
                const refreshed = await syncAllUsersFromRemote()
                if (alive) applyUsers(refreshed)
            } catch (error) {
                console.warn('Failed to refresh staff users', error)
            }
        })()
        return () => {
            alive = false
        }
    }, [applyUsers])

    useEffect(() => {
        const onUpdate = () => void loadLocal()
        window.addEventListener('users:updated', onUpdate)
        return () => window.removeEventListener('users:updated', onUpdate)
    }, [loadLocal])

    const startNew = () => {
        setSelected(null)
        setForm({
            pin: '',
            role: 'limited',
            name: '',
            email: '',
            phone: '',
            notes: '',
        })
    }

    const selectUser = (pin: string) => {
        const u = users.find((x) => x.pin === pin)
        if (u) {
            setSelected(pin)
            setForm({ ...u })
        }
    }

    const openPager = (user: EditableUser, event?: React.MouseEvent) => {
        if (event) {
            event.stopPropagation()
            event.preventDefault()
        }
        setPagerTarget(user)
        setPagerMessage('Order ready at the pass.')
        setPagerError(null)
        setPagerOpen(true)
    }

    const sendPager = async () => {
        if (!pagerTarget) return
        const trimmedMessage = pagerMessage.trim()
        if (!trimmedMessage) {
            setPagerError('Add a short message before sending the page.')
            return
        }
        setPagerSending(true)
        setPagerError(null)
        try {
            const delivered = await pageStaffMember(pagerTarget.pin, {
                message: trimmedMessage,
                origin: pagerTarget.role,
            })
            setMessage(
                delivered
                    ? `Paged ${pagerTarget.name || pagerTarget.pin}.`
                    : `Pager queued for ${pagerTarget.name || pagerTarget.pin}; it will be sent once online.`
            )
            setPagerOpen(false)
        } catch (err) {
            setPagerError(err instanceof Error ? err.message : String(err))
        } finally {
            setPagerSending(false)
        }
    }

    const onChange = (patch: Partial<EditableUser>) => {
        setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    }

    const save = async () => {
        if (!form) return
        setSaving(true)
        setMessage(null)
        setError(null)
        const prevPin = selected
        const nextPin = form.pin.trim()
        if (!/^\d{4,}$/.test(nextPin)) {
            setError('PIN must be at least 4 digits')
            setSaving(false)
            return
        }
        try {
            // Local-first: update Dexie immediately
            await upsertUserLocal({
                pin: nextPin,
                role: form.role,
                name: form.name,
                email: form.email,
                phone: form.phone,
                notes: form.notes,
            })
            setMessage('Saved locally. Syncing…')
            window.dispatchEvent(new CustomEvent('users:updated'))

            // Remote sync
            const payload = {
                action: 'saveUser' as const,
                pin: nextPin,
                role: form.role,
                name: form.name,
                email: form.email,
                phone: form.phone,
                notes: form.notes,
            }
            // If pin changed, request a change first
            if (prevPin && prevPin !== nextPin) {
                try {
                    const r = await fetch('/api/gas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'changePin',
                            oldPin: prevPin,
                            newPin: nextPin,
                        }),
                    })
                    if (!r.ok) throw new Error('changePin failed')
                } catch {
                    // Queue changePin for later
                    await enqueue({
                        action: 'changePin',
                        payload: { oldPin: prevPin, newPin: nextPin },
                    })
                }
            }

            try {
                const res = await fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error('saveUser failed')
                setMessage('Saved and synced.')
            } catch {
                // Queue for later
                await enqueue({ action: 'saveUser', payload })
                setMessage('Saved. Will sync when online.')
            }
            setSelected(nextPin)
            await loadLocal()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="py-4 sm:py-6">
            <div className="mb-4">
                <h1 className="text-lg font-semibold">Manage Staff</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Local-first users with background sync to the server.
                </p>
            </div>
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-5">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Users
                            </h2>
                            <Button variant="outline" onClick={startNew}>
                                New
                            </Button>
                        </div>
                        {users.length === 0 ? (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                No users yet.
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                                {users.map((u) => (
                                    <li
                                        key={u.pin}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <button
                                            className={`w-full px-3 py-2 text-left text-sm ${
                                                selected === u.pin
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                                            }`}
                                            onClick={() => selectUser(u.pin)}
                                        >
                                            <div className="font-medium">
                                                {u.name || u.pin}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                PIN: {u.pin} • Role: {u.role}
                                            </div>
                                        </button>
                                        <button
                                            className="ml-2 inline-flex items-center whitespace-nowrap rounded-full border border-brand-400/60 px-3 py-1 text-xs font-semibold text-brand-700 hover:border-brand-500 hover:text-brand-800 dark:border-brand-500/40 dark:text-brand-200 dark:hover:border-brand-400"
                                            onClick={(event) =>
                                                openPager(u, event)
                                            }
                                            aria-label={`Page ${u.name || u.pin}`}
                                        >
                                            Page
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-7">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                        <h2 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                            {selected ? 'Edit User' : 'New User'}
                        </h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    PIN
                                </label>
                                <input
                                    className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    value={form?.pin || ''}
                                    onChange={(e) =>
                                        onChange({ pin: e.target.value })
                                    }
                                    placeholder="0000"
                                    inputMode="numeric"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Role
                                </label>
                                <select
                                    className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    value={form?.role || 'limited'}
                                    onChange={(e) =>
                                        onChange({ role: e.target.value })
                                    }
                                >
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-2">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Name
                                </label>
                                <input
                                    className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    value={form?.name || ''}
                                    onChange={(e) =>
                                        onChange({ name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Email
                                </label>
                                <input
                                    className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    value={form?.email || ''}
                                    onChange={(e) =>
                                        onChange({ email: e.target.value })
                                    }
                                    type="email"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Phone
                                </label>
                                <input
                                    className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    value={form?.phone || ''}
                                    onChange={(e) =>
                                        onChange({ phone: e.target.value })
                                    }
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Notes
                                </label>
                                <textarea
                                    className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                    rows={3}
                                    value={form?.notes || ''}
                                    onChange={(e) =>
                                        onChange({ notes: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            {error ? (
                                <div className="mr-auto text-sm text-red-600">
                                    {error}
                                </div>
                            ) : null}
                            {message ? (
                                <div className="mr-auto text-sm text-emerald-600">
                                    {message}
                                </div>
                            ) : null}
                            <Button
                                variant="outline"
                                onClick={() =>
                                    setForm(
                                        selected
                                            ? users.find(
                                                  (u) => u.pin === selected
                                              ) || null
                                            : null
                                    )
                                }
                                disabled={saving}
                            >
                                Reset
                            </Button>
                            <Button
                                variant="primary"
                                onClick={save}
                                disabled={!form || saving}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            <Modal
                isOpen={pagerOpen}
                onClose={() => {
                    if (!pagerSending) {
                        setPagerOpen(false)
                        setPagerError(null)
                    }
                }}
                className="max-w-md mx-4"
            >
                <div className="flex flex-col gap-4 p-6">
                    <div className="space-y-1">
                        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                            Page {pagerTarget?.name || pagerTarget?.pin}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Send a quick alert to let them know their order is
                            ready.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {PAGER_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setPagerMessage(preset)}
                                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-200"
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <textarea
                        className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        rows={3}
                        value={pagerMessage}
                        onChange={(event) =>
                            setPagerMessage(event.target.value)
                        }
                        placeholder="Order ready at the pass."
                        disabled={pagerSending}
                    />
                    {pagerError ? (
                        <p className="text-sm text-red-600">{pagerError}</p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!pagerSending) {
                                    setPagerOpen(false)
                                    setPagerError(null)
                                }
                            }}
                            disabled={pagerSending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={sendPager}
                            disabled={
                                pagerSending ||
                                pagerMessage.trim().length === 0 ||
                                !pagerTarget
                            }
                        >
                            {pagerSending ? 'Paging…' : 'Send page'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
