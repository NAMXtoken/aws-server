const STORAGE_KEY = 'pos:settings:general'
export const GENERAL_SETTINGS_STORAGE_KEY = STORAGE_KEY

const fallbackTimeZone = (() => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
        return 'UTC'
    }
})()

export type GeneralSettings = {
    storeName: string
    storeTagline: string
    timeZone: string
    locale: string
    currencyCode: string
    currencySymbol: string
    contactEmail: string
    contactPhone: string
    defaultTaxRate: string
    receiptFooter: string
}

const defaultLocale = 'en-US'
const defaultCurrency = 'THB'

export function deriveCurrencySymbol(
    currencyCode: string,
    locale: string
): string {
    if (!currencyCode) return ''
    try {
        const formatter = new Intl.NumberFormat(locale || defaultLocale, {
            style: 'currency',
            currency: currencyCode,
            currencyDisplay: 'symbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })
        if (typeof formatter.formatToParts === 'function') {
            const symbolPart = formatter
                .formatToParts(0)
                .find((part) => part.type === 'currency')
            if (symbolPart?.value) return symbolPart.value
        }
        const formatted = formatter.format(0)
        const symbol = formatted.replace(/[\d\s.,-]/g, '')
        return symbol || currencyCode
    } catch {
        return currencyCode
    }
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
    storeName: 'Bynd POS',
    storeTagline: 'Modern point of sale',
    timeZone: fallbackTimeZone,
    locale: defaultLocale,
    currencyCode: defaultCurrency,
    currencySymbol: deriveCurrencySymbol(defaultCurrency, defaultLocale),
    contactEmail: '',
    contactPhone: '',
    defaultTaxRate: '10',
    receiptFooter: 'Thanks for shopping with us!',
}

export function loadGeneralSettings(): GeneralSettings {
    if (typeof window === 'undefined') {
        return DEFAULT_GENERAL_SETTINGS
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_GENERAL_SETTINGS
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') {
            return DEFAULT_GENERAL_SETTINGS
        }
        return {
            ...DEFAULT_GENERAL_SETTINGS,
            ...(parsed as Partial<GeneralSettings>),
        }
    } catch {
        return DEFAULT_GENERAL_SETTINGS
    }
}

export function saveGeneralSettings(settings: GeneralSettings): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
        try {
            window.dispatchEvent(new CustomEvent('pos:settings:updated'))
        } catch {
            // Ignore custom event dispatch issues
        }
    } catch {
        // Ignore persistence issues (e.g., private mode quota)
    }
}
