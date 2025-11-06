'use client'
import { upsertUserLocal } from '@/lib/local-users'
import React from 'react'

function readCookie(name: string): string | null {
    const match = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(name + '='))
    return match ? decodeURIComponent(match.split('=')[1]) : null
}

export default function ProfileForm() {
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [message, setMessage] = React.useState<string | null>(null)

    const [pin, setPin] = React.useState<string>('')

    const [currentPin, setCurrentPin] = React.useState<string>('')
    const [role, setRole] = React.useState<string>('')
    const [name, setName] = React.useState('')
    const [email, setEmail] = React.useState('')
    const [phone, setPhone] = React.useState('')
    const [notes, setNotes] = React.useState('')

    React.useEffect(() => {
        const cPin = readCookie('pin')
        const cRole = readCookie('role') || 'limited'
        if (!cPin) {
            setError('Missing PIN cookie. Please re-login.')
            setLoading(false)
            return
        }
        setPin(cPin)
        setCurrentPin(cPin)
        setRole(cRole)
        ;(async () => {
            try {
                const res = await fetch(
                    `/api/gas?action=getUser&pin=${encodeURIComponent(cPin)}`
                )
                const ct = res.headers.get('content-type') || ''
                if (!ct.includes('application/json')) {
                    const text = await res.text()
                    console.error(
                        'Non-JSON response while loading profile:',
                        text?.slice(0, 300)
                    )
                    setError('Failed to load profile (non-JSON response).')
                    return
                }
                const data = await res.json()
                if (data && data.ok && data.user) {
                    setName(String(data.user.name || ''))
                    setEmail(String(data.user.email || ''))
                    setPhone(String(data.user.phone || ''))
                    setNotes(String(data.user.notes || ''))
                } else if (data && data.ok === false) {
                    setError(String(data.error || 'Failed to load profile.'))
                }
            } catch (e) {
                setError('Failed to load profile.')
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    async function onSave(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setMessage(null)
        try {
            // If PIN changed, apply it first
            if (pin !== currentPin) {
                if (!/^\d{4}$/.test(pin)) {
                    setError('PIN must be 4 digits.')
                    setSaving(false)
                    return
                }
                const pinRes = await fetch(`/api/gas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'changePin',
                        oldPin: currentPin,
                        newPin: pin,
                    }),
                })
                const pinCT = pinRes.headers.get('content-type') || ''
                if (!pinCT.includes('application/json')) {
                    const text = await pinRes.text()
                    console.error(
                        'Non-JSON response while changing PIN:',
                        text?.slice(0, 300)
                    )
                    setError('Failed to change PIN (non-JSON response).')
                    setSaving(false)
                    return
                }
                const pinData = await pinRes.json()
                if (!pinData?.ok) {
                    setError(String(pinData?.error || 'Failed to change PIN.'))
                    setSaving(false)
                    return
                }
                document.cookie = `pin=${pin}; path=/; max-age=${60 * 60 * 8}`
                setCurrentPin(pin)
            }

            const res = await fetch(`/api/gas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'saveUser',
                    pin,
                    role,
                    name,
                    email,
                    phone,
                    notes,
                }),
            })
            const ct = res.headers.get('content-type') || ''
            if (!ct.includes('application/json')) {
                const text = await res.text()
                console.error(
                    'Non-JSON response while saving profile:',
                    text?.slice(0, 300)
                )
                setError('Failed to save profile (non-JSON response).')
                return
            }
            const data = await res.json()
            if (data && data.ok) {
                setMessage('Profile saved.')
                try {
                    const pinStr = String(pin)
                    await upsertUserLocal({
                        pin: pinStr,
                        role,
                        name,
                        email,
                        phone,
                        notes,
                    })
                } catch {}
                try {
                    const evt = new CustomEvent('users:updated')
                    window.dispatchEvent(evt)
                } catch {}
            } else setError(String((data && data.error) || 'Failed to save.'))
        } catch (e) {
            setError('Network error saving profile.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
                Loading profile...
            </div>
        )
    }

    return (
        <form
            onSubmit={onSave}
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Your Profile
            </h3>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
            {message ? (
                <div className="text-sm text-green-600">{message}</div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        New PIN (4 digits)
                    </label>
                    <input
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="****"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Name
                    </label>
                    <input
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email
                    </label>
                    <input
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Phone
                    </label>
                    <input
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Notes
                    </label>
                    <textarea
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    Role: {role || 'limited'}
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center rounded-lg border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    )
}
