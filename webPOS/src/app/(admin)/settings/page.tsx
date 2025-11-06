'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import Button from '@/components/ui/button/Button'
import { useToast } from '@/components/uiz/use-toast'
import {
    DEFAULT_GENERAL_SETTINGS,
    deriveCurrencySymbol,
    loadGeneralSettings,
    saveGeneralSettings,
} from '@/lib/settings'
import type { GeneralSettings } from '@/lib/settings'

const FALLBACK_TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Bangkok',
    'Asia/Singapore',
    'Australia/Sydney',
]

const LANGUAGE_OPTIONS = [
    { value: 'en-US', label: 'English (United States)' },
    { value: 'th-TH', label: 'Thai (Thailand)' },
    { value: 'es-ES', label: 'Spanish (Spain)' },
    { value: 'fr-FR', label: 'French (France)' },
    { value: 'zh-CN', label: 'Chinese (Simplified)' },
]

const CURRENCY_OPTIONS = [
    { code: 'USD', label: 'USD - United States Dollar' },
    { code: 'EUR', label: 'EUR - Euro' },
    { code: 'GBP', label: 'GBP - British Pound' },
    { code: 'THB', label: 'THB - Thai Baht' },
    { code: 'SGD', label: 'SGD - Singapore Dollar' },
    { code: 'AUD', label: 'AUD - Australian Dollar' },
    { code: 'JPY', label: 'JPY - Japanese Yen' },
    { code: 'CAD', label: 'CAD - Canadian Dollar' },
]

function sanitizeTaxRate(value: string): string {
    return value.replace(/[^\d.,]/g, '').replace(/,/g, '.')
}

export default function SettingsPage() {
    const { toast } = useToast()
    const [settings, setSettings] = useState<GeneralSettings>(
        DEFAULT_GENERAL_SETTINGS
    )
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const data = loadGeneralSettings()
        setSettings(data)
        setLoaded(true)
        ;(async () => {
            try {
                const res = await fetch('/api/gas?action=getPosSettings', {
                    cache: 'no-store',
                })
                if (res.ok) {
                    const js = await res.json().catch(() => ({}) as any)
                    const remote = (js &&
                        (js.settings ||
                            js.data ||
                            {})) as Partial<GeneralSettings>
                    if (remote && Object.keys(remote).length) {
                        setSettings((prev) => ({ ...prev, ...remote }))
                        // Persist locally for offline use
                        try {
                            saveGeneralSettings({
                                ...data,
                                ...remote,
                            } as GeneralSettings)
                        } catch {}
                    }
                }
            } catch {}
        })()
    }, [])

    const timeZones = useMemo(() => {
        try {
            const supported = (
                Intl as unknown as {
                    supportedValuesOf?: (key: string) => string[]
                }
            ).supportedValuesOf
            if (supported) {
                return supported.call(Intl, 'timeZone')
            }
        } catch {
            // ignore
        }
        return FALLBACK_TIMEZONES
    }, [])

    const derivedSymbol = useMemo(() => {
        return deriveCurrencySymbol(settings.currencyCode, settings.locale)
    }, [settings.currencyCode, settings.locale])

    const handleFieldChange = <Key extends keyof GeneralSettings>(
        field: Key,
        value: GeneralSettings[Key]
    ) => {
        setSettings((prev) => ({ ...prev, [field]: value }))
    }

    const handleCurrencyChange = (code: string) => {
        setSettings((prev) => {
            const previousDerived = deriveCurrencySymbol(
                prev.currencyCode,
                prev.locale
            )
            const nextDerived = deriveCurrencySymbol(code, prev.locale)
            const shouldUpdateSymbol =
                !prev.currencySymbol || prev.currencySymbol === previousDerived
            return {
                ...prev,
                currencyCode: code,
                currencySymbol: shouldUpdateSymbol
                    ? nextDerived
                    : prev.currencySymbol,
            }
        })
    }

    const handleLocaleChange = (locale: string) => {
        setSettings((prev) => {
            const previousDerived = deriveCurrencySymbol(
                prev.currencyCode,
                prev.locale
            )
            const nextDerived = deriveCurrencySymbol(prev.currencyCode, locale)
            const shouldUpdateSymbol =
                !prev.currencySymbol || prev.currencySymbol === previousDerived
            return {
                ...prev,
                locale,
                currencySymbol: shouldUpdateSymbol
                    ? nextDerived
                    : prev.currencySymbol,
            }
        })
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setSaving(true)
        try {
            // Persist locally first
            saveGeneralSettings(settings)
            // Sync to GAS Settings / POS Settings
            try {
                const res = await fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'savePosSettings',
                        settings,
                    }),
                })
                const ok = res.ok
                if (!ok) {
                    const text = await res.text().catch(() => '')
                    throw new Error(
                        text || 'Failed to sync settings to Google Sheets'
                    )
                }
            } catch (e) {
                // Non-blocking warning if sync fails
                const msg = e instanceof Error ? e.message : String(e)
                toast({
                    title: 'Cloud sync failed',
                    description: msg,
                    variant: 'destructive',
                })
            }
            toast({
                title: 'Settings saved',
                description:
                    'Preferences synced to POS Settings in Google Sheets.',
            })
        } catch (error) {
            toast({
                title: 'Unable to save',
                description:
                    error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
            })
        } finally {
            setSaving(false)
        }
    }

    const handleReset = () => {
        setSettings(DEFAULT_GENERAL_SETTINGS)
        toast({
            title: 'Defaults restored',
            description: 'Review and save to apply these defaults.',
        })
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Settings
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Configure store defaults for the POS experience. Language
                    selection is saved for future localisation work.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-lg font-medium">Store profile</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Details shown across reports, receipts, and
                        customer-facing screens.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Store name
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.storeName}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'storeName',
                                        event.target.value
                                    )
                                }
                                placeholder="Acme Cafe"
                                required
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Tagline
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.storeTagline}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'storeTagline',
                                        event.target.value
                                    )
                                }
                                placeholder="Great coffee, fast service"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Contact email
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.contactEmail}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'contactEmail',
                                        event.target.value
                                    )
                                }
                                placeholder="hello@example.com"
                                type="email"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Contact phone
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.contactPhone}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'contactPhone',
                                        event.target.value
                                    )
                                }
                                placeholder="+66 2 123 4567"
                            />
                        </label>
                    </div>
                    <label className="mt-4 flex flex-col gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            Receipt footer
                        </span>
                        <textarea
                            className="min-h-[90px] w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                            value={settings.receiptFooter}
                            onChange={(event) =>
                                handleFieldChange(
                                    'receiptFooter',
                                    event.target.value
                                )
                            }
                            placeholder="Thank you for visiting! See you soon."
                        />
                    </label>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-lg font-medium">
                        Regional preferences
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Time zone, language, and currency drive formatting in
                        reports and receipts.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Time zone
                            </span>
                            <select
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.timeZone}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'timeZone',
                                        event.target.value
                                    )
                                }
                            >
                                {timeZones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Display language{' '}
                                <span className="text-xs font-normal text-gray-500">
                                    (coming soon)
                                </span>
                            </span>
                            <select
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.locale}
                                onChange={(event) =>
                                    handleLocaleChange(event.target.value)
                                }
                            >
                                {LANGUAGE_OPTIONS.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Currency
                            </span>
                            <select
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.currencyCode}
                                onChange={(event) =>
                                    handleCurrencyChange(event.target.value)
                                }
                            >
                                {CURRENCY_OPTIONS.map((option) => (
                                    <option
                                        key={option.code}
                                        value={option.code}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Currency symbol
                                <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                                    Suggested: {derivedSymbol}
                                </span>
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.currencySymbol}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'currencySymbol',
                                        event.target.value
                                    )
                                }
                                placeholder={derivedSymbol}
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Default tax rate (%)
                            </span>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700"
                                value={settings.defaultTaxRate}
                                onChange={(event) =>
                                    handleFieldChange(
                                        'defaultTaxRate',
                                        sanitizeTaxRate(event.target.value)
                                    )
                                }
                                inputMode="decimal"
                                placeholder="0"
                            />
                        </label>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        These preferences currently apply per-device. Connect
                        the POS to Apps Script to sync across the team.
                    </p>
                </section>

                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={saving || !loaded}
                    >
                        {saving ? 'Saving...' : 'Save settings'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        disabled={saving}
                    >
                        Reset to defaults
                    </Button>
                    {!loaded && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            Loading saved preferences...
                        </span>
                    )}
                </div>
            </form>
        </div>
    )
}
