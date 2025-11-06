// Client-side fetchers for reports (no server-only helpers here)

export type SalesByDay = {
    ok: true
    year: number
    month: number
    days: Array<{
        date: string
        total: number
        cash: number
        card: number
        promptpay: number
        count: number
    }>
}

export type SalesByMonth = {
    ok: true
    year: number
    months: Array<{
        month: number
        total: number
        cash: number
        card: number
        promptpay: number
        count: number
    }>
}

export type SummaryByWindow = {
    ok: true
    cashSales: number
    cardSales: number
    promptPaySales: number
    ticketsCount: number
    itemsSold: Array<{ name: string; qty: number }>
}

export type DailyShiftCloseSummary = {
    rowNumber: number | null
    shiftId: string
    closedAt: string
    managerOnDuty: string
    staffCount: number | null
    grossSales: number | null
    netSales: number | null
    taxCollected: number | null
    voidedAmount: number | null
    ticketsCount: number | null
    completedTickets: number | null
    averageTicketValue: number | null
    averageItemsPerTicket: number | null
    cashSales: number | null
    cardSales: number | null
    promptPaySales: number | null
    otherSales: number | null
    hoursOpen: number | null
    cashDrawerStart: number | null
    cashDrawerEnd: number | null
    cashVariance: number | null
}

export type DailySalesDaySummary = {
    day: number
    sheet: string
    date: string
    weekday: string
    grossSales: number
    netSales: number
    taxCollected: number
    itemsSold: number
    averageItemPrice: number
    tickets: number
    averageTicketValue: number
    payments: {
        cash: number
        card: number
        promptPay: number
    }
    paymentPercentages: {
        card: number
        cash: number
        promptPay: number
    }
    employees: Array<{ name: string; total: number }>
    shiftClosures?: DailyShiftCloseSummary[]
}

export type DailySalesSummaryResponse = {
    ok: boolean
    year: number
    month: number
    monthName?: string
    days: DailySalesDaySummary[]
    error?: string
    needsTenantContext?: boolean
}

export type InventorySnapshotRow = {
    id: string
    closingStock: number
    package?: string
    packageUnits?: string
    packageVolume?: number
    addedStock?: number
}

export type InventorySnapshotResponse = {
    ok: boolean
    rows: InventorySnapshotRow[]
    error?: string
    needsTenantContext?: boolean
    menuAvailability?: MenuAvailabilityEntry[]
}

export type MenuAvailabilityEntry = {
    id: string
    name: string
    available: number
    limitingIngredient?: string | null
    ingredients: Array<{
        name: string
        required: number
        available: number
        stock: number
    }>
}

export async function fetchSalesByDayClient(
    year: number,
    month: number
): Promise<SalesByDay> {
    const res = await fetch(
        `/api/gas?action=salesByDay&year=${year}&month=${month}`
    )
    if (!res.ok) return { ok: true, year, month, days: [] }
    return (await res.json()) as SalesByDay
}

export async function fetchSalesByMonthClient(
    year: number
): Promise<SalesByMonth> {
    const res = await fetch(`/api/gas?action=salesByMonth&year=${year}`)
    if (!res.ok) return { ok: true, year, months: [] as any }
    return (await res.json()) as SalesByMonth
}

export async function fetchSummaryByWindow(
    start: string,
    end: string
): Promise<SummaryByWindow> {
    const res = await fetch(
        `/api/gas?action=summaryByWindow&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    )
    if (!res.ok)
        return {
            ok: true,
            cashSales: 0,
            cardSales: 0,
            promptPaySales: 0,
            ticketsCount: 0,
            itemsSold: [],
        }
    return (await res.json()) as SummaryByWindow
}

export async function fetchDailySalesSummary(
    year?: number,
    month?: number
): Promise<DailySalesSummaryResponse> {
    const params = new URLSearchParams()
    params.set('action', 'dailySalesSummary')
    if (typeof year === 'number' && !isNaN(year)) {
        params.set('year', String(year))
    }
    if (typeof month === 'number' && !isNaN(month)) {
        params.set('month', String(month))
    }
    const res = await fetch(`/api/gas?${params.toString()}`)
    if (!res.ok) {
        let payload: unknown = null
        try {
            payload = await res.json()
        } catch {
            payload = null
        }
        const errorMessage =
            (payload &&
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as { error?: unknown }).error === 'string'
                ? (payload as { error: string }).error
                : payload &&
                    typeof payload === 'object' &&
                    payload !== null &&
                    'message' in payload &&
                    typeof (payload as { message?: unknown }).message ===
                        'string'
                  ? (payload as { message: string }).message
                  : undefined) || `Request failed with status ${res.status}`
        const needsTenantContext =
            typeof errorMessage === 'string' &&
            errorMessage.toLowerCase().includes('tenant context missing')
        return {
            ok: false,
            year: year || new Date().getFullYear(),
            month: month || new Date().getMonth() + 1,
            monthName: '',
            days: [],
            error: errorMessage,
            needsTenantContext,
        }
    }
    return (await res.json()) as DailySalesSummaryResponse
}

export async function fetchInventorySnapshotClient(opts?: {
    fresh?: boolean
}): Promise<InventorySnapshotResponse> {
    const params = new URLSearchParams()
    params.set('action', 'inventorySnapshot')
    if (opts?.fresh) params.set('fresh', '1')
    const res = await fetch(`/api/gas?${params.toString()}`, {
        cache: opts?.fresh ? 'no-store' : 'default',
    })
    if (!res.ok) {
        let payload: unknown = null
        try {
            payload = await res.json()
        } catch {
            payload = null
        }
        const errorMessage =
            (payload &&
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as { error?: unknown }).error === 'string'
                ? (payload as { error: string }).error
                : payload &&
                    typeof payload === 'object' &&
                    payload !== null &&
                    'message' in payload &&
                    typeof (payload as { message?: unknown }).message ===
                        'string'
                  ? (payload as { message: string }).message
                  : undefined) || `Request failed with status ${res.status}`
        const needsTenantContext =
            typeof errorMessage === 'string' &&
            errorMessage.toLowerCase().includes('tenant context missing')
        return {
            ok: false,
            rows: [],
            error: errorMessage,
            needsTenantContext,
            menuAvailability:
                payload &&
                typeof payload === 'object' &&
                payload !== null &&
                'menuAvailability' in payload &&
                Array.isArray(
                    (payload as { menuAvailability?: unknown }).menuAvailability
                )
                    ? ((
                          payload as {
                              menuAvailability: MenuAvailabilityEntry[]
                          }
                      ).menuAvailability as MenuAvailabilityEntry[])
                    : [],
        }
    }
    return (await res.json()) as InventorySnapshotResponse
}
