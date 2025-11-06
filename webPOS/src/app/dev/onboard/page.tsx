'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { tenantSlugToSupabaseId } from '@/lib/tenant-ids'
import {
    deriveTenantIdFromEmail,
    saveTenantConfigLocal,
    setTenantBootstrapFlag,
} from '@/lib/tenant-config'
import type { TenantConfig } from '@/types/tenant'
import { upsertUserLocal } from '@/lib/local-users'

type FlowMode = 'select' | 'owner' | 'subtenant'

type InvitePayload = {
    version: number
    tenantSlug: string
    tenantId: string
    ownerEmail: string
    token: string
    createdAt: number
}

type StoredInvite = InvitePayload & {
    label?: string | null
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const SAFE_LOCALSTORAGE_KEY = 'byndpos.devTenantInvites'

const DEV_MODE_ENABLED =
    process.env.NEXT_PUBLIC_ENABLE_DEV_TENANT_ONBOARDING === 'true' ||
    process.env.NODE_ENV !== 'production'

function encodeInvite(payload: InvitePayload): string {
    const json = JSON.stringify(payload)
    if (typeof window === 'undefined') {
        throw new Error('Invite encoding only supported in the browser')
    }
    const base64 = btoa(encodeURIComponent(json))
    return `bynd-dev:${base64}`
}

function decodeInvite(code: string): InvitePayload | null {
    if (!code) return null
    const trimmed = code.trim()
    const PREFIX = 'bynd-dev:'
    if (!trimmed.toLowerCase().startsWith(PREFIX)) return null
    const raw = trimmed.slice(PREFIX.length)
    try {
        if (typeof window === 'undefined') {
            throw new Error('Invite decoding only supported in the browser')
        }
        const json = decodeURIComponent(atob(raw))
        const parsed = JSON.parse(json) as InvitePayload
        if (
            typeof parsed.tenantSlug === 'string' &&
            typeof parsed.tenantId === 'string' &&
            typeof parsed.ownerEmail === 'string'
        ) {
            return parsed
        }
    } catch {
        return null
    }
    return null
}

function setCookie(name: string, value: string | null) {
    if (typeof document === 'undefined') return
    if (!value) {
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
        return
    }
    document.cookie = `${name}=${encodeURIComponent(
        value
    )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

function randomToken(bytes = 8) {
    if (
        typeof crypto === 'undefined' ||
        typeof crypto.getRandomValues === 'undefined'
    ) {
        return Math.random().toString(36).slice(2, 2 + bytes * 2)
    }
    const arr = new Uint8Array(bytes)
    crypto.getRandomValues(arr)
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function formatInviteLabel(payload: InvitePayload): string {
    const date = new Date(payload.createdAt)
    return `${payload.tenantSlug} • ${date.toLocaleString()}`
}

function loadStoredInvites(): StoredInvite[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(SAFE_LOCALSTORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed as StoredInvite[]
    } catch {
        return []
    }
}

function saveStoredInvites(list: StoredInvite[]) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(
            SAFE_LOCALSTORAGE_KEY,
            JSON.stringify(list.slice(0, 20))
        )
    } catch {
        // ignore storage errors
    }
}

const Instructions = () => (
    <section className="space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-100 p-4 text-sm text-black">
        <p className="font-semibold uppercase tracking-wide text-gray-800">
            Dev-only Pager Auth Helper
        </p>
        <p>
            Use this flow to test tenant/sub-tenant scenarios on localhost
            without fighting shared cookies. It stores credentials in cookies
            only and should never run in production.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
            <li>
                Start as an account owner. Provide a name/email to mint a tenant
                    and copy the invite string.
            </li>
            <li>
                Open a new profile/incognito window, choose the sub-tenant flow,
                and paste the invite string. Provide your own details.
            </li>
            <li>
                Repeat as needed to generate multiple sub-tenant personas or
                reset cookies to bounce between users.
            </li>
        </ol>
    </section>
)

export default function DevOnboardPage() {
    const [mode, setMode] = useState<FlowMode>('select')
    const [ownerName, setOwnerName] = useState('')
    const [ownerEmail, setOwnerEmail] = useState('')
    const [customSlug, setCustomSlug] = useState('')
    const [ownerResult, setOwnerResult] = useState<string | null>(null)
    const [ownerError, setOwnerError] = useState<string | null>(null)
    const [subInvite, setSubInvite] = useState('')
    const [subName, setSubName] = useState('')
    const [subEmail, setSubEmail] = useState('')
    const [subRole, setSubRole] = useState<'manager' | 'staff'>('staff')
    const [subPin, setSubPin] = useState('')
    const [subResult, setSubResult] = useState<string | null>(null)
    const [subError, setSubError] = useState<string | null>(null)
    const [storedInvites, setStoredInvites] = useState<StoredInvite[]>([])

    useEffect(() => {
        if (!DEV_MODE_ENABLED) return
        setStoredInvites(loadStoredInvites())
    }, [])

    const resetState = useCallback(() => {
        setOwnerName('')
        setOwnerEmail('')
        setCustomSlug('')
        setOwnerResult(null)
        setOwnerError(null)
        setSubInvite('')
        setSubName('')
        setSubEmail('')
        setSubRole('staff')
        setSubResult(null)
        setSubError(null)
    }, [])

    const handleOwnerSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            setOwnerResult(null)
            setOwnerError(null)

            const trimmedEmail = ownerEmail.trim().toLowerCase()
            if (!trimmedEmail) {
                setOwnerError('Email is required to create a tenant.')
                return
            }
        const normalizedCustom = customSlug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '')
        const derivedSlug =
            deriveTenantIdFromEmail(trimmedEmail) ||
            `tenant-${randomToken(4)}`
        const baseSlug = normalizedCustom
            ? normalizedCustom.startsWith('tenant-')
                ? normalizedCustom
                : `tenant-${normalizedCustom}`
            : derivedSlug
        try {
            const tenantId = await tenantSlugToSupabaseId(baseSlug)
            const token = randomToken()
            const payload: InvitePayload = {
                version: 1,
                tenantSlug: baseSlug,
                tenantId,
                ownerEmail: trimmedEmail,
                token,
                createdAt: Date.now(),
            }
            const invite = encodeInvite(payload)

            setCookie('tenantSlug', baseSlug)
            setCookie('tenantId', tenantId)
            setCookie('accountEmail', trimmedEmail)
            if (ownerName.trim().length) {
                setCookie('name', ownerName.trim())
            }
            setCookie('role', 'owner')

            const config: TenantConfig = {
                tenantId,
                accountEmail: trimmedEmail,
                settingsSpreadsheetId: '',
                menuSpreadsheetId: null,
                driveFolderId: null,
                metadata: { bootstrapComplete: true },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }
            await saveTenantConfigLocal(config)
            setTenantBootstrapFlag(tenantId, true)

            const nextInvites = [
                payload as StoredInvite,
                ...loadStoredInvites().filter(
                    (entry) => entry.tenantSlug !== baseSlug
                ),
            ].map((entry) => ({
                ...entry,
                label:
                    entry.label ??
                    `${entry.tenantSlug} • ${new Date(
                        entry.createdAt
                    ).toLocaleString()}`,
            }))
            saveStoredInvites(nextInvites)
            setStoredInvites(nextInvites)

            setOwnerResult(invite)
        } catch (error) {
            setOwnerError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create tenant invite.'
            )
        }
        },
        [customSlug, ownerEmail, ownerName]
    )

    const handleSubSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            setSubResult(null)
            setSubError(null)

            const payload = decodeInvite(subInvite)
            if (!payload) {
                setSubError('Invite code is invalid or malformed.')
                return
            }
            const tenantSlug = payload.tenantSlug
            const tenantId =
                payload.tenantId ||
                (await tenantSlugToSupabaseId(payload.tenantSlug))

            const effectiveEmail = subEmail.trim().toLowerCase()
            if (!effectiveEmail) {
                setSubError('Provide an email for the sub-tenant account.')
                return
            }

            setCookie('tenantSlug', tenantSlug)
            setCookie('tenantId', tenantId)
            setCookie('accountEmail', effectiveEmail)
            if (subName.trim().length) {
                setCookie('name', subName.trim())
            }
            setCookie('role', subRole)
            const trimmedPin = subPin.trim()
            if (!/^\d{4}$/.test(trimmedPin)) {
                setSubError('Set a 4-digit PIN for the sub-tenant (e.g. 1234).')
                return
            }
            setCookie('pin', trimmedPin)

            await upsertUserLocal({
                pin: trimmedPin,
                name: subName.trim().length ? subName.trim() : trimmedPin,
                role: subRole,
                email: effectiveEmail,
            })

            const config: TenantConfig = {
                tenantId,
                accountEmail: effectiveEmail,
                settingsSpreadsheetId: '',
                menuSpreadsheetId: null,
                driveFolderId: null,
                metadata: { bootstrapComplete: true },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }
            await saveTenantConfigLocal(config)
            setTenantBootstrapFlag(tenantId, true)

            setSubResult(
                `Linked to ${tenantSlug}. Reload or open the POS to act as a ${subRole}.`
            )
        },
        [subInvite, subEmail, subName, subRole, subPin]
    )

    const handleResetCookies = useCallback(() => {
        ;[
            'tenantSlug',
            'tenantId',
            'accountEmail',
            'name',
            'role',
            'pin',
            'sessionToken',
        ].forEach((cookie) => setCookie(cookie, null))
        resetState()
    }, [resetState])

    const disableActions = !DEV_MODE_ENABLED

    const inviteOptions = useMemo(
        () =>
            storedInvites.map((invite) => ({
                value: encodeInvite(invite),
                label: invite.label ?? formatInviteLabel(invite),
            })),
        [storedInvites]
    )

    if (!DEV_MODE_ENABLED) {
        return (
            <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
                <h1 className="text-2xl font-semibold text-slate-100">
                    Dev Tenant Onboarding Disabled
                </h1>
                <p className="text-slate-300">
                    This helper only runs locally. Set
                    <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 text-xs">
                        NEXT_PUBLIC_ENABLE_DEV_TENANT_ONBOARDING=true
                    </code>
                    to try it in staging.
                </p>
            </main>
        )
    }

    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-6 bg-white px-4 py-10 text-black">
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-black">
                    Dev Tenant Onboarding
                </h1>
                <p>
                    Quickly mint owner/sub-tenant personas for pager testing on
                    localhost. Cookies update instantly; reload the POS app in a
                    new tab to apply changes.
                </p>
            </header>

            <Instructions />

            <section className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => {
                        setMode('owner')
                        resetState()
                    }}
                    disabled={disableActions}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                        mode === 'owner'
                            ? 'bg-emerald-400 text-black'
                            : 'bg-gray-200 text-black hover:bg-gray-300'
                    }`}
                >
                    I am the account owner
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setMode('subtenant')
                        resetState()
                    }}
                    disabled={disableActions}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                        mode === 'subtenant'
                            ? 'bg-sky-300 text-black'
                            : 'bg-gray-200 text-black hover:bg-gray-300'
                    }`}
                >
                    I am a sub-tenant
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setMode('select')
                        resetState()
                    }}
                    className="rounded-md px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={handleResetCookies}
                    className="ml-auto rounded-md px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100"
                >
                    Clear tenant cookies
                </button>
            </section>

            {mode === 'select' ? (
                <section className="space-y-4 rounded-lg border border-gray-300 bg-gray-100 p-6">
                    <h2 className="text-xl font-semibold">
                        Choose a starting point
                    </h2>
                    <p>
                        Start as an owner to mint a tenant and invite string.
                        Then open a fresh session (incognito or separate
                        profile) and join as a sub-tenant using that invite. You
                        can repeat as needed to simulate multiple users.
                    </p>
                </section>
            ) : null}

            {mode === 'owner' ? (
                <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6">
                    <h2 className="text-xl font-semibold text-emerald-700">
                        Account owner setup
                    </h2>
                    <form className="space-y-4" onSubmit={handleOwnerSubmit}>
                        <div className="grid gap-2">
                            <label
                                htmlFor="owner-name"
                                className="text-sm font-medium text-emerald-700"
                            >
                                Display name (optional)
                            </label>
                            <input
                                id="owner-name"
                                value={ownerName}
                                onChange={(event) =>
                                    setOwnerName(event.target.value)
                                }
                                placeholder="Ada Lovelace"
                                className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-black outline-none focus:border-emerald-400"
                                autoComplete="name"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label
                                htmlFor="owner-email"
                                className="text-sm font-medium text-emerald-700"
                            >
                                Owner email (required)
                            </label>
                            <input
                                id="owner-email"
                                value={ownerEmail}
                                onChange={(event) =>
                                    setOwnerEmail(event.target.value)
                                }
                                placeholder="owner@example.com"
                                type="email"
                                required
                                className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-black outline-none focus:border-emerald-400"
                                autoComplete="email"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label
                                htmlFor="tenant-slug"
                                className="text-sm font-medium text-emerald-700"
                            >
                                Custom tenant slug (optional)
                            </label>
                            <input
                                id="tenant-slug"
                                value={customSlug}
                                onChange={(event) =>
                                    setCustomSlug(event.target.value)
                                }
                                placeholder="tenant-coffee-shop"
                                className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-black outline-none focus:border-emerald-400"
                            />
                            <p className="text-xs text-emerald-700/80">
                                Leave blank to derive from the owner email. We
                                prefix with <code>tenant-</code> automatically.
                            </p>
                        </div>
                        <button
                            type="submit"
                            className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300"
                        >
                            Create tenant and generate invite
                        </button>
                    </form>
                    {ownerError ? (
                        <p className="rounded-md border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {ownerError}
                        </p>
                    ) : null}
                    {ownerResult ? (
                        <div className="space-y-2 rounded-md border border-emerald-200 bg-white p-4">
                            <p className="text-sm text-emerald-700">
                                Share this invite with sub-tenants:
                            </p>
                            <code className="block break-all rounded bg-emerald-100 px-3 py-2 text-xs text-emerald-800">
                                {ownerResult}
                            </code>
                            <p className="text-xs text-emerald-700/80">
                                Copy it into a sub-tenant session (see form
                                below). Tenant cookies are now set for this
                                browser; open the POS to continue as owner.
                            </p>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {mode === 'subtenant' ? (
                <section className="space-y-4 rounded-lg border border-sky-300 bg-sky-50 p-6">
                    <h2 className="text-xl font-semibold text-sky-700">
                        Sub-tenant onboarding
                    </h2>
                    <form className="space-y-4" onSubmit={handleSubSubmit}>
                        <div className="grid gap-2">
                            <label
                                htmlFor="invite-code"
                                className="text-sm font-medium text-sky-700"
                            >
                                Invite code
                            </label>
                            <textarea
                                id="invite-code"
                                value={subInvite}
                                onChange={(event) =>
                                    setSubInvite(event.target.value)
                                }
                                placeholder="bynd-dev:..."
                                className="min-h-[90px] rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-sky-400"
                            />
                        </div>
                        {inviteOptions.length ? (
                            <div className="grid gap-2">
                                <label className="text-xs font-medium uppercase tracking-wide text-sky-700">
                                    Quick pick
                                </label>
                                <div className="flex max-w-full flex-wrap gap-2">
                                    {inviteOptions.map((option) => (
                                        <button
                                            type="button"
                                            key={option.value}
                                            onClick={() =>
                                                setSubInvite(option.value)
                                            }
                                            className="rounded-md border border-sky-200 px-3 py-1 text-xs text-sky-700 hover:bg-sky-100"
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <div className="grid gap-2">
                            <label
                                htmlFor="sub-name"
                                className="text-sm font-medium text-sky-700"
                            >
                                Display name (optional)
                            </label>
                            <input
                                id="sub-name"
                                value={subName}
                                onChange={(event) =>
                                    setSubName(event.target.value)
                                }
                                placeholder="Grace Hopper"
                                className="rounded-md border border-sky-200 bg-white px-3 py-2 text-black outline-none focus:border-sky-400"
                                autoComplete="name"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label
                                htmlFor="sub-email"
                                className="text-sm font-medium text-sky-700"
                            >
                                Sub-tenant email
                            </label>
                            <input
                                id="sub-email"
                                value={subEmail}
                                onChange={(event) =>
                                    setSubEmail(event.target.value)
                                }
                                placeholder="staff@example.com"
                                type="email"
                                required
                                className="rounded-md border border-sky-200 bg-white px-3 py-2 text-black outline-none focus:border-sky-400"
                                autoComplete="email"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label
                                htmlFor="sub-pin"
                                className="text-sm font-medium text-sky-700"
                            >
                                4-digit PIN
                            </label>
                            <input
                                id="sub-pin"
                                value={subPin}
                                onChange={(event) =>
                                    setSubPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))
                                }
                                placeholder="1234"
                                inputMode="numeric"
                                pattern="\d{4}"
                                required
                                className="rounded-md border border-sky-200 bg-white px-3 py-2 text-black outline-none focus:border-sky-400"
                            />
                            <p className="text-xs text-sky-700/80">
                                Use unique PINs so you can tell which persona triggered pager alerts.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <span className="text-sm font-medium text-sky-700">
                                Role
                            </span>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm text-sky-700">
                                    <input
                                        type="radio"
                                        name="sub-role"
                                        value="manager"
                                        checked={subRole === 'manager'}
                                        onChange={() => setSubRole('manager')}
                                    />
                                    Manager
                                </label>
                                <label className="flex items-center gap-2 text-sm text-sky-700">
                                    <input
                                        type="radio"
                                        name="sub-role"
                                        value="staff"
                                        checked={subRole === 'staff'}
                                        onChange={() => setSubRole('staff')}
                                    />
                                    Staff
                                </label>
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-300"
                        >
                            Join tenant as {subRole}
                        </button>
                    </form>
                    {subError ? (
                        <p className="rounded-md border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {subError}
                        </p>
                    ) : null}
                    {subResult ? (
                        <div className="space-y-2 rounded-md border border-sky-200 bg-white p-4 text-sm text-sky-700">
                            <p className="text-black">{subResult}</p>
                            <p className="text-xs text-sky-700/80">
                                Tip: open{' '}
                                <Link href="/" className="underline">
                                    the POS home
                                </Link>{' '}
                                in this session to verify the tenant context.
                            </p>
                        </div>
                    ) : null}
                </section>
            ) : null}
        </main>
    )
}
