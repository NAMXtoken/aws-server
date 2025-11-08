'use client'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/uiz/dropdown-menu'
import { broadcastUpdate, useRealtime } from '@/hooks/use-realtime'
import { listUsersLocal, syncAllUsersFromRemote } from '@/lib/local-users'
// Local-first POS services
import { useTenant } from '@/context/TenantContext'
import { HorizontaLDots } from '@/icons'
import MobileNavGrid from '@/layout/MobileNavGrid'
import { db } from '@/lib/db'
import {
    hasOptionStructure,
    parseInventoryOptions,
} from '@/lib/inventory-options'
import {
    listCategories as dbListCategories,
    listMenu as dbListMenu,
} from '@/lib/local-catalog'
import {
    createVoidRequest,
    getCurrentShift as dbGetCurrentShift,
    getTicketItems as dbGetTicketItems,
    openTicket as dbOpenTicket,
    payTicket as dbPayTicket,
    saveCart as dbSaveCart,
    updateTicketDetails as dbUpdateTicketDetails,
} from '@/lib/local-pos'
import { getSessionActor } from '@/lib/session'
import {
    DEFAULT_GENERAL_SETTINGS,
    GENERAL_SETTINGS_STORAGE_KEY,
    deriveCurrencySymbol,
    loadGeneralSettings,
} from '@/lib/settings'
import { liveQuery } from 'dexie'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../ecommerce/hooks/use-toast'
import type {
    CartItem,
    Category,
    MenuItem,
    SelectedCartOption,
    Ticket,
} from '../ecommerce/types/pos'

type View = 'tickets' | 'pos'

const NAV_GRID_COLLAPSE_KEY = 'mobileNavGridCollapse'
const NAV_GRID_COLLAPSE_EVENT = 'mobileNavGrid:collapse'

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(name + '='))
    return match ? decodeURIComponent(match.split('=')[1]) : null
}

const formatTicketLabel = (ticket?: {
    ticketName?: string | null
    name?: string | null
    ticketId?: string | null
}): string => {
    if (!ticket) return 'Ticket'
    const explicit =
        (ticket.ticketName && String(ticket.ticketName).trim()) ||
        (ticket.name && String(ticket.name).trim())
    if (explicit) return String(explicit)
    const rawId = String(ticket.ticketId ?? '').trim()
    if (!rawId) return 'Ticket'
    const suffix = rawId.split('-').pop() || rawId
    const digits = suffix.replace(/[^0-9]/g, '')
    return digits ? `Ticket ${digits.padStart(3, '0')}` : rawId
}

export function TicketView() {
    const { toast } = useToast()
    const router = useRouter()
    const pathname = usePathname()
    const disableNavGrid = pathname === '/sales' || pathname === '/tickets'
    const { tenant, loading: tenantLoading } = useTenant()
    const isTenantBootstrapped = tenant?.metadata?.bootstrapComplete !== false
    const [showNavGrid, setShowNavGrid] = useState(() => {
        if (disableNavGrid) return false
        if (typeof window === 'undefined') return true
        return window.sessionStorage.getItem(NAV_GRID_COLLAPSE_KEY) !== '1'
    })

    // Tickets state
    const [tickets, setTickets] = useState<Ticket[]>([])
    useEffect(() => {
        let mounted = true
        const sub = liveQuery(async () => {
            const rows = await db.tickets
                .where('status')
                .equals('open')
                .sortBy('openedAt')
            return rows.map((t) => {
                const openedAtMs = Number(t.openedAt) || Date.now()
                const rawNotes = (t as any).notes
                const rawCovers = (t as any).covers
                const normalizedNotes =
                    typeof rawNotes === 'string'
                        ? rawNotes
                        : rawNotes != null
                          ? String(rawNotes)
                          : null
                const normalizedCovers =
                    rawCovers != null && rawCovers !== ''
                        ? (() => {
                              const parsed = Math.floor(Number(rawCovers))
                              return Number.isFinite(parsed) && parsed >= 0
                                  ? parsed
                                  : null
                          })()
                        : null
                return {
                    ticketId: t.id,
                    openedBy: t.openedBy || '-',
                    openedAt: new Date(openedAtMs).toLocaleString(),
                    openedAtMs,
                    price: '0',
                    status: t.status,
                    date: new Date(openedAtMs).toISOString().slice(0, 10),
                    ticketName: (t as any).name,
                    covers: normalizedCovers,
                    notes: normalizedNotes,
                } satisfies Ticket
            })
        }).subscribe({
            next: (mapped) => {
                if (mounted) setTickets(mapped)
            },
            error: () => {
                /* ignore */
            },
        })
        return () => {
            mounted = false
            try {
                sub.unsubscribe()
            } catch {}
        }
    }, [])
    const [query, setQuery] = useState('')
    const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
    const activeTicket = useMemo(
        () =>
            selectedTicket
                ? tickets.find((t) => t.ticketId === selectedTicket) || null
                : null,
        [selectedTicket, tickets]
    )
    const activeTicketLabel = useMemo(() => {
        if (!activeTicket) return ''
        const ticketName = (activeTicket as any)?.ticketName
        const plainName = (activeTicket as any)?.name
        return (
            ticketName ||
            formatTicketLabel({
                ticketName,
                name: plainName,
                ticketId: activeTicket.ticketId,
            })
        )
    }, [activeTicket])
    // Removed provisional ticket flow to avoid accidental duplicate opens
    const [loadingTickets, setLoadingTickets] = useState(false)

    // POS state
    const [currentView, setCurrentView] = useState<View>('pos')
    const [categories, setCategories] = useState<Category[]>([])
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [activeCategory, setActiveCategory] = useState<string | undefined>(
        undefined
    )
    const [cartByTicket, setCartByTicket] = useState<
        Record<string, CartItem[]>
    >({})
    const [saving, setSaving] = useState(false)
    const [savedQtyByTicket, setSavedQtyByTicket] = useState<
        Record<string, Record<string, number>>
    >({})
    const [settings, setSettings] = useState(DEFAULT_GENERAL_SETTINGS)
    const [optionsOpen, setOptionsOpen] = useState(false)
    const [optionDialogItem, setOptionDialogItem] = useState<MenuItem | null>(
        null
    )
    const [optionSelections, setOptionSelections] = useState<
        Record<string, string>
    >({})
    const [optionError, setOptionError] = useState<string | null>(null)
    const [voidOpen, setVoidOpen] = useState(false)
    const [voidItemName, setVoidItemName] = useState('')
    const [voidMaxQty, setVoidMaxQty] = useState(0)
    const [voidQty, setVoidQty] = useState('')
    const [voidApprover, setVoidApprover] = useState('')
    const [voidReason, setVoidReason] = useState('')
    const [approvers, setApprovers] = useState<
        Array<{ id: string; name: string }>
    >([])
    const [voidItems, setVoidItems] = useState<
        Array<{ name: string; qty: number }>
    >([])
    const [mobileSelectedCartKey, setMobileSelectedCartKey] = useState<
        string | null
    >(null)
    const [openTicketPromptOpen, setOpenTicketPromptOpen] = useState(false)
    const [pendingMenuItem, setPendingMenuItem] = useState<MenuItem | null>(
        null
    )
    const [pendingMenuAutoAdd, setPendingMenuAutoAdd] = useState(false)
    const resetPendingMenuIntent = useCallback(() => {
        setPendingMenuItem(null)
        setPendingMenuAutoAdd(false)
    }, [])
    useEffect(() => {
        if (!optionDialogItem || !optionDialogItem.options) {
            if (optionSelections && Object.keys(optionSelections).length) {
                setOptionSelections({})
            }
            setOptionError(null)
            return
        }
        const defaults: Record<string, string> = {}
        for (const group of optionDialogItem.options) {
            const first = group.choices[0]
            if (first) defaults[group.id] = first.id
        }
        setOptionSelections(defaults)
        setOptionError(null)
    }, [optionDialogItem])
    useEffect(() => {
        if (typeof window === 'undefined') return
        const refresh = () => {
            try {
                setSettings(loadGeneralSettings())
            } catch {
                setSettings({ ...DEFAULT_GENERAL_SETTINGS })
            }
        }
        refresh()
        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === GENERAL_SETTINGS_STORAGE_KEY) {
                refresh()
            }
        }
        const handleCustom = () => refresh()
        window.addEventListener('storage', handleStorage)
        window.addEventListener('pos:settings:updated', handleCustom)
        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener('pos:settings:updated', handleCustom)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const collapse = () => setShowNavGrid(false)
        window.addEventListener(NAV_GRID_COLLAPSE_EVENT, collapse)
        try {
            const flag = window.sessionStorage.getItem(NAV_GRID_COLLAPSE_KEY)
            if (flag === '1') {
                setShowNavGrid(false)
            }
            window.sessionStorage.removeItem(NAV_GRID_COLLAPSE_KEY)
        } catch {
            /* ignore session storage errors */
        }
        return () => {
            window.removeEventListener(NAV_GRID_COLLAPSE_EVENT, collapse)
        }
    }, [])
    useEffect(() => {
        if (disableNavGrid) {
            setShowNavGrid(false)
        }
    }, [disableNavGrid])

    // Listen for inventory updates and ticket/cart updates from other tabs
    useRealtime({
        onTickets: () => {
            if (selectedTicket) {
                void loadTicketCart(selectedTicket)
            }
        },
        onInventory: () => {
            ;(async () => {
                if (!isTenantBootstrapped) return
                try {
                    const [menuRows, catRows] = await Promise.all([
                        dbListMenu(),
                        dbListCategories(),
                    ])
                    setMenuItems(
                        menuRows.map((m: any) => {
                            const parsedOptions = parseInventoryOptions(
                                m.options
                            )
                            const options = hasOptionStructure(parsedOptions)
                                ? parsedOptions
                                : undefined
                            return {
                                id: m.id,
                                name: m.name,
                                description: m.description,
                                price: m.price,
                                image: m.image,
                                category: m.category,
                                options,
                            }
                        })
                    )
                    const cats = catRows
                        .map((c: any) => ({
                            id: c.id,
                            label: c.label,
                            icon: c.icon || '',
                            value: c.value,
                        }))
                        .sort((a, b) =>
                            (a.label || '').localeCompare(
                                b.label || '',
                                undefined,
                                {
                                    sensitivity: 'base',
                                }
                            )
                        )
                    setCategories(cats)
                    setActiveCategory((prev) => {
                        if (prev === undefined) return prev
                        const prevNorm = normalize(prev)
                        const exists = cats.some(
                            (c) => normalize(categoryKey(c) ?? '') === prevNorm
                        )
                        return exists ? prev : undefined
                    })
                } catch (err) {
                    console.warn('Menu refresh from cache failed', err)
                }
            })()
        },
    })
    const currencySymbol = useMemo(() => {
        const trimmed = settings.currencySymbol?.trim()
        if (trimmed) return trimmed
        return deriveCurrencySymbol(settings.currencyCode, settings.locale)
    }, [settings.currencySymbol, settings.currencyCode, settings.locale])

    const currencyFormatter = useMemo(() => {
        try {
            if (typeof Intl === 'undefined') return null
            return new Intl.NumberFormat(settings.locale || 'en-US', {
                style: 'currency',
                currency: settings.currencyCode || 'USD',
            })
        } catch {
            return null
        }
    }, [settings.locale, settings.currencyCode])

    const formatCurrency = useCallback(
        (amount: number) => {
            const safe = Number.isFinite(amount) ? amount : 0
            if (currencyFormatter) {
                try {
                    return currencyFormatter.format(safe)
                } catch {
                    // ignore formatter errors
                }
            }
            if (currencySymbol && currencySymbol.length > 0) {
                return `${currencySymbol}${safe.toFixed(2)}`
            }
            return safe.toFixed(2)
        },
        [currencyFormatter, currencySymbol]
    )
    const [isAdmin, setIsAdmin] = useState(false)
    const normalize = (s?: string) =>
        s
            ? s
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '')
            : ''
    const categoryKey = (c: Category) => c?.value ?? c?.label ?? c?.id
    const variantKeyFor = (item: { id: string; variantKey?: string | null }) =>
        item.variantKey && item.variantKey.length > 0
            ? item.variantKey
            : item.id
    const buildSelectedOptions = (
        item: MenuItem,
        selections: Record<string, string>
    ): SelectedCartOption[] => {
        const groups = item.options ?? []
        const selected: SelectedCartOption[] = []
        for (const group of groups) {
            const selectedChoiceId = selections[group.id]
            if (!selectedChoiceId) continue
            const choice = group.choices.find(
                (entry) => entry.id === selectedChoiceId
            )
            if (!choice) continue
            selected.push({
                groupId: group.id,
                groupName: group.name,
                choiceId: choice.id,
                choiceName: choice.name,
                priceDelta: Number(choice.priceDelta ?? 0) || 0,
                ingredients: choice.ingredients,
            })
        }
        return selected
    }
    const buildCartItem = (
        menuItem: MenuItem,
        selectedOptions?: SelectedCartOption[]
    ): CartItem => {
        const basePrice = Number(menuItem.price) || 0
        const optionsArray =
            selectedOptions && selectedOptions.length > 0
                ? selectedOptions
                : undefined
        const totalDelta = optionsArray
            ? optionsArray.reduce(
                  (sum, opt) => sum + (Number(opt.priceDelta) || 0),
                  0
              )
            : 0
        const price =
            Math.round((basePrice + totalDelta + Number.EPSILON) * 100) / 100
        const choiceKey =
            optionsArray && optionsArray.length > 0
                ? optionsArray
                      .map((opt) => opt.choiceId)
                      .sort()
                      .join('+')
                : ''
        const variantKey = choiceKey
            ? `${menuItem.id}::${choiceKey}`
            : menuItem.id
        const optionLabel =
            optionsArray && optionsArray.length > 0
                ? optionsArray.map((opt) => opt.choiceName).join(', ')
                : ''
        const displayName = optionLabel
            ? `${menuItem.name} (${optionLabel})`
            : menuItem.name
        return {
            ...menuItem,
            quantity: 1,
            price,
            basePrice,
            variantKey,
            selectedOptions: optionsArray,
            displayName,
        }
    }

    // Sync selected ticket with a cookie so global UI (header search) can add items
    const updateSelectedTicket = (id: string | null) => {
        setSelectedTicket(id)
        try {
            if (id) {
                document.cookie = `selectedTicket=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 2}`
            } else {
                document.cookie = `selectedTicket=; path=/; max-age=0`
            }
        } catch {}
    }

    const openTickets = useMemo(
        () =>
            (Array.isArray(tickets) ? tickets : []).filter(
                (t) => (t.status ?? 'open').toLowerCase() === 'open'
            ),
        [tickets]
    )

    // Totals helpers (declared before use)
    function getDefaultTaxRatePercent(): number {
        try {
            const s = loadGeneralSettings()
            const raw = String(s.defaultTaxRate || '').replace(',', '.')
            const n = parseFloat(raw)
            return Number.isFinite(n) ? n : 0
        } catch {
            return 0
        }
    }
    function getTicketTaxRatePercent(t: Ticket): number {
        const anyT = t as any
        const fromTicket = Number(anyT?.taxRate ?? NaN)
        if (Number.isFinite(fromTicket)) return fromTicket
        return getDefaultTaxRatePercent()
    }
    function ticketTotalNumber(t: Ticket): number {
        const items = cartByTicket[t.ticketId] || []
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
        if (subtotal > 0) {
            const rate = getTicketTaxRatePercent(t)
            return subtotal + (subtotal * rate) / 100
        }
        const parsed = parseFloat((t.price as unknown as string) || '0')
        return Number.isFinite(parsed) ? parsed : 0
    }
    function ticketTotalFor(t: Ticket): string {
        return formatCurrency(ticketTotalNumber(t))
    }

    const pushMenuItemToTicket = (ticketId: string, menuItem: MenuItem) => {
        setCartByTicket((prev) => {
            const current = prev[ticketId] || []
            const existing = current.find((i) => i.id === menuItem.id)
            const updated = existing
                ? current.map((i) =>
                      i.id === menuItem.id
                          ? { ...i, quantity: (i.quantity || 0) + 1 }
                          : i
                  )
                : [...current, { ...menuItem, quantity: 1 }]
            return { ...prev, [ticketId]: updated }
        })
    }

    const applyPendingMenuItem = (ticketId: string): string | null => {
        if (!pendingMenuAutoAdd) {
            return null
        }
        if (!pendingMenuItem) {
            resetPendingMenuIntent()
            return null
        }
        const name = pendingMenuItem.name
        pushMenuItemToTicket(ticketId, pendingMenuItem)
        resetPendingMenuIntent()
        return name
    }

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = openTickets
        if (!q) return base
        return base.filter(
            (t) =>
                t.ticketId.toLowerCase().includes(q) ||
                (t.openedBy ?? '').toLowerCase().includes(q)
        )
    }, [openTickets, query, cartByTicket])

    // API helpers
    async function fetchOpenTickets() {
        /* no-op in live mode */
    }

    async function openTicketAPI(
        openedBy: string,
        input?: { covers?: number | null; notes?: string | null }
    ) {
        return dbOpenTicket(openedBy, input) // { ticketId, openedAt }
    }

    // We save entire carts at once; single-item path unused
    async function addItemToTicket(_ticketId: string, _item: CartItem) {
        return { ok: true } as any
    }

    async function closeTicketAPI(
        ticketId: string,
        paymentMethod?: 'Cash' | 'Card' | 'PromptPay'
    ) {
        const map: any = { Cash: 'cash', Card: 'card', PromptPay: 'promptPay' }
        const m = paymentMethod ? map[paymentMethod] || 'cash' : 'cash'
        return dbPayTicket(ticketId, m as any)
    }

    async function payTicketAPI(
        ticketId: string,
        paymentMethod: 'Cash' | 'Card' | 'PromptPay'
    ) {
        return closeTicketAPI(ticketId, paymentMethod)
    }

    // POS actions
    const [creatingTicket, setCreatingTicket] = useState(false)
    const [newTicketDialogOpen, setNewTicketDialogOpen] = useState(false)
    const [newTicketCovers, setNewTicketCovers] = useState('1')
    const [newTicketNote, setNewTicketNote] = useState('')
    const [newTicketSubmitting, setNewTicketSubmitting] = useState(false)
    const [newTicketError, setNewTicketError] = useState<string | null>(null)
    const [coversDraft, setCoversDraft] = useState('1')
    const [noteDraft, setNoteDraft] = useState('')
    const [savingDetails, setSavingDetails] = useState(false)

    const handleNewTicket = async () => {
        if (creatingTicket) return
        setCreatingTicket(true)
        try {
            const curShift = await dbGetCurrentShift()
            if (!curShift) {
                toast({
                    title: 'Open a shift first',
                    description:
                        'No open shift found. Go to Shift to open one.',
                    variant: 'destructive',
                })
                resetPendingMenuIntent()
                try {
                    setTimeout(() => {
                        window.location.href = '/shift'
                    }, 300)
                } catch {}
                return
            }
            if (hasZeroOpenTicket) {
                const zeros = openTickets.filter(
                    (t) => ticketTotalNumber(t) === 0
                )
                if (zeros.length > 0) {
                    const chosen = zeros[0]
                    updateSelectedTicket(chosen.ticketId)
                    await loadTicketCart(chosen.ticketId)
                    const addedItemName = pendingMenuAutoAdd
                        ? applyPendingMenuItem(chosen.ticketId)
                        : null
                    toast({
                        title: 'Resumed empty ticket',
                        description: addedItemName
                            ? `Ticket ${chosen.ticketId}. Added ${addedItemName}.`
                            : `Ticket ${chosen.ticketId}`,
                    })
                    return
                }
            }
            setNewTicketError(null)
            setNewTicketCovers('1')
            setNewTicketNote('')
            setNewTicketDialogOpen(true)
        } catch (e) {
            console.error('Failed to open ticket', e)
            toast({
                title: 'Failed to open ticket',
                description:
                    e instanceof Error ? e.message : 'Could not create ticket',
                variant: 'destructive',
            })
        } finally {
            setCreatingTicket(false)
        }
    }

    const confirmNewTicket = async () => {
        if (newTicketSubmitting) return
        if (!newTicketDialogOpen) return
        const trimmedCovers = newTicketCovers.trim()
        if (!trimmedCovers) {
            setNewTicketError('Enter the number of covers.')
            return
        }
        const parsedCovers = Number(trimmedCovers)
        if (!Number.isFinite(parsedCovers) || parsedCovers <= 0) {
            setNewTicketError('Covers must be at least 1.')
            return
        }
        const coversValue = Math.floor(parsedCovers)
        setNewTicketError(null)
        setNewTicketSubmitting(true)
        try {
            const openedByName = getSessionActor()
            const noteValue = newTicketNote.trim()
            const newTicket = await openTicketAPI(openedByName, {
                covers: coversValue,
                notes: noteValue.length > 0 ? noteValue : null,
            })
            const openedAtMs = newTicket.openedAt ?? Date.now()
            const created: Ticket = {
                ticketId: newTicket.ticketId as any,
                openedBy: openedByName as any,
                openedAt: new Date(openedAtMs).toLocaleString() as any,
                openedAtMs,
                price: '0' as any,
                status: 'open' as any,
                date: new Date(openedAtMs).toISOString().slice(0, 10) as any,
                ticketName: (newTicket as any).name as any,
                covers: (newTicket as any).covers ?? coversValue,
                notes:
                    (newTicket as any).notes ??
                    (noteValue.length > 0 ? noteValue : null),
            }
            setTickets((prev) => [created, ...prev])
            setCartByTicket((prev) => ({
                ...prev,
                [newTicket.ticketId]: prev[newTicket.ticketId] || [],
            }))
            const addedItemName = pendingMenuAutoAdd
                ? applyPendingMenuItem(newTicket.ticketId)
                : null
            updateSelectedTicket(newTicket.ticketId)
            setCurrentView('pos')
            toast({
                title: 'Ticket opened',
                description: addedItemName
                    ? `Opened ${newTicket.ticketId} and added ${addedItemName}.`
                    : `Opened ${newTicket.ticketId}`,
            })
            broadcastUpdate('tickets')
            setNewTicketDialogOpen(false)
            setNewTicketNote('')
            setNewTicketCovers('1')
        } catch (e) {
            console.error('Failed to open ticket', e)
            setNewTicketError(
                e instanceof Error
                    ? e.message
                    : 'Could not create ticket. Try again.'
            )
            toast({
                title: 'Failed to open ticket',
                description:
                    e instanceof Error ? e.message : 'Could not create ticket',
                variant: 'destructive',
            })
        } finally {
            setNewTicketSubmitting(false)
        }
    }

    useEffect(() => {
        if (!activeTicket) {
            setCoversDraft('1')
            setNoteDraft('')
            return
        }
        setCoversDraft(
            activeTicket.covers != null && activeTicket.covers > 0
                ? String(activeTicket.covers)
                : '1'
        )
        setNoteDraft(activeTicket.notes ?? '')
    }, [activeTicket])

    useEffect(() => {
        if (optionsOpen || !activeTicket) return
        setCoversDraft(
            activeTicket.covers != null && activeTicket.covers > 0
                ? String(activeTicket.covers)
                : '1'
        )
        setNoteDraft(activeTicket.notes ?? '')
    }, [optionsOpen, activeTicket])

    const openOptionsDialog = () => {
        if (!selectedTicket || !activeTicket) return
        setCoversDraft(
            activeTicket.covers != null && activeTicket.covers > 0
                ? String(activeTicket.covers)
                : '1'
        )
        setNoteDraft(activeTicket.notes ?? '')
        setOptionsOpen(true)
    }

    const handleSaveTicketDetails = async () => {
        if (!selectedTicket || !activeTicket || savingDetails) return
        const normalizedCovers = coversCount
        const trimmedNote = noteDraft.trim()
        const normalizedNote = trimmedNote.length > 0 ? trimmedNote : null
        const currentCovers = activeTicket.covers ?? null
        const currentNote =
            activeTicket.notes && activeTicket.notes.trim().length > 0
                ? activeTicket.notes.trim()
                : null
        if (
            normalizedCovers === currentCovers &&
            normalizedNote === currentNote
        ) {
            toast({
                title: 'No changes',
                description: 'Covers and note are already up to date.',
            })
            return
        }
        setSavingDetails(true)
        try {
            await dbUpdateTicketDetails(selectedTicket, {
                covers: normalizedCovers,
                notes: normalizedNote,
            })
            setTickets((prev) =>
                prev.map((t) =>
                    t.ticketId === selectedTicket
                        ? {
                              ...t,
                              covers: normalizedCovers,
                              notes: normalizedNote ?? null,
                          }
                        : t
                )
            )
            setCoversDraft(String(normalizedCovers))
            setNoteDraft(normalizedNote ?? '')
            toast({
                title: 'Ticket details saved',
                description: 'Covers and note updated.',
            })
            broadcastUpdate('tickets')
            setOptionsOpen(false)
        } catch (e) {
            console.error('Failed to save ticket details', e)
            toast({
                title: 'Update failed',
                description: 'Could not save ticket details.',
                variant: 'destructive',
            })
        } finally {
            setSavingDetails(false)
        }
    }

    async function loadTicketCart(ticketId: string) {
        try {
            const itemsArray: any[] = await dbGetTicketItems(ticketId)

            if (!Array.isArray(itemsArray) || itemsArray.length === 0) {
                // No persisted items for this ticket yet
                setCartByTicket((prev) => ({ ...prev, [ticketId]: [] }))
                setSavedQtyByTicket((prev) => ({ ...prev, [ticketId]: {} }))
                return
            }

            // Map menu by normalized name for matching
            const byName: Record<string, MenuItem> = {}
            for (const m of menuItems) {
                byName[normalize(m.name)] = m
            }

            const byId = new Map<string, CartItem>()
            const savedMap: Record<string, number> = {}
            for (const it of itemsArray) {
                const name: string = String(it.name ?? it.itemName ?? '')
                const qty: number = Number(it.qty ?? it.quantity ?? 0) || 0
                const price: number = Number(it.price ?? 0) || 0
                if (!name || qty <= 0) continue
                const key = normalize(name)
                const menu = byName[key]
                const id = menu ? menu.id : name // fallback id by name
                const existing = byId.get(id)
                if (existing) {
                    existing.quantity += qty
                    existing.price = menu
                        ? price > 0
                            ? price
                            : menu.price
                        : existing.price
                } else {
                    byId.set(
                        id,
                        menu
                            ? {
                                  ...menu,
                                  quantity: qty,
                                  price: price > 0 ? price : menu.price,
                              }
                            : {
                                  id,
                                  name,
                                  description: '',
                                  image: '',
                                  category: '',
                                  price,
                                  quantity: qty,
                              }
                    )
                }
                savedMap[id] = (savedMap[id] || 0) + qty
            }
            const cart: CartItem[] = Array.from(byId.values())
            setCartByTicket((prev) => ({ ...prev, [ticketId]: cart }))
            setSavedQtyByTicket((prev) => ({ ...prev, [ticketId]: savedMap }))
        } catch (e) {
            console.error('Failed to load ticket cart', e)
        }
    }

    const handleResume = (id: string) => {
        updateSelectedTicket(id)
        setCurrentView('pos')
        loadTicketCart(id)
        toast({ title: 'Resume ticket', description: `Resuming ${id}` })
    }

    const [payDialogOpen, setPayDialogOpen] = useState(false)
    const [payTicketId, setPayTicketId] = useState<string | null>(null)
    const [payLoading, setPayLoading] = useState(false)
    const [payMethodLoading, setPayMethodLoading] = useState<
        'Cash' | 'Card' | 'PromptPay' | null
    >(null)
    const [paySelectedMethod, setPaySelectedMethod] = useState<
        'Cash' | 'Card' | 'PromptPay' | null
    >(null)
    const [cashCollected, setCashCollected] = useState<string>('')
    const [cashError, setCashError] = useState<string | null>(null)

    const openPayDialog = useCallback((id: string) => {
        setPayTicketId(id)
        setPayLoading(false)
        setPayMethodLoading(null)
        setPaySelectedMethod(null)
        setCashCollected('')
        setCashError(null)
        setPayDialogOpen(true)
    }, [])

    const handlePay = async (method: 'Cash' | 'Card' | 'PromptPay') => {
        if (!payTicketId) return
        try {
            setPayLoading(true)
            setPayMethodLoading(method)
            const tid = payTicketId
            // Persist any unsaved cart changes before paying
            try {
                const itemsToSave = cartByTicket[tid] || []
                if (itemsToSave.length > 0) await dbSaveCart(tid, itemsToSave)
            } catch {}
            // Optimistic close and close modal immediately
            setTickets((prev) =>
                prev.map((t) =>
                    t.ticketId === tid ? { ...t, status: 'closed' } : t
                )
            )
            // liveQuery will reflect this after db update
            if (selectedTicket === tid) updateSelectedTicket(null)
            setPayDialogOpen(false)
            setPayTicketId(null)
            toast({
                title: 'Processing payment…',
                description: `Ticket ${tid} via ${method}`,
            })
            payTicketAPI(tid, method)
                .then(() => {
                    toast({
                        title: 'Payment recorded',
                        description: `Ticket ${tid} paid via ${method}`,
                    })
                    fetchOpenTickets()
                    // Cross-tab update
                    broadcastUpdate('tickets')
                    router.push('/tickets')
                })
                .catch((e) => {
                    console.error('Payment failed', e)
                    // Rollback optimistic
                    setTickets((prev) =>
                        prev.map((t) =>
                            t.ticketId === tid ? { ...t, status: 'open' } : t
                        )
                    )
                    // rollback handled locally; liveQuery will correct if needed
                    toast({
                        title: 'Payment failed',
                        description: 'Could not record payment',
                        variant: 'destructive',
                    })
                })
                .finally(() => {
                    setPayLoading(false)
                    setPayMethodLoading(null)
                })
            return
        } catch (e) {
            console.error('Payment failed', e)
            // Rollback optimistic
            setTickets((prev) =>
                prev.map((t) =>
                    t.ticketId === payTicketId ? { ...t, status: 'open' } : t
                )
            )
            // liveQuery will revalidate
            toast({
                title: 'Payment failed',
                description: 'Could not record payment',
                variant: 'destructive',
            })
        } finally {
            setPayLoading(false)
            setPayMethodLoading(null)
        }
    }

    const startCashFlow = () => {
        setPaySelectedMethod('Cash')
        setCashCollected('')
        setCashError(null)
    }

    const confirmCashPayment = async () => {
        if (!payTicketId) return
        const t = tickets.find((tk) => tk.ticketId === payTicketId)
        const totalDue = t ? ticketTotalNumber(t) : 0
        const tendered = parseFloat(cashCollected)
        if (!Number.isFinite(tendered)) {
            setCashError('Enter a valid amount')
            return
        }
        if (tendered < totalDue) {
            setCashError(
                `Amount is less than total (${formatCurrency(totalDue)})`
            )
            return
        }
        const change = tendered - totalDue
        try {
            setCashError(null)
            setPayLoading(true)
            setPayMethodLoading('Cash')
            const tid2 = payTicketId
            // Persist any unsaved cart changes before paying
            try {
                const itemsToSave = cartByTicket[tid2] || []
                if (itemsToSave.length > 0) await dbSaveCart(tid2, itemsToSave)
            } catch {}
            // Optimistic: mark closed and close modal immediately
            setTickets((prev) =>
                prev.map((x) =>
                    x.ticketId === tid2 ? { ...x, status: 'closed' } : x
                )
            )
            // liveQuery will reflect this after db update
            if (selectedTicket === tid2) setSelectedTicket(null)
            setPayDialogOpen(false)
            setPayTicketId(null)
            setPaySelectedMethod(null)
            toast({
                title: 'Processing cash…',
                description: `Change: ${formatCurrency(change)}`,
            })
            payTicketAPI(tid2, 'Cash')
                .then(() => {
                    toast({
                        title: 'Cash payment recorded',
                        description: `Change: ${formatCurrency(change)}`,
                    })
                    fetchOpenTickets()
                    try {
                        broadcastUpdate('tickets')
                    } catch {}
                    router.push('/tickets')
                })
                .catch((e) => {
                    console.error('Payment failed', e)
                    setTickets((prev) =>
                        prev.map((x) =>
                            x.ticketId === tid2 ? { ...x, status: 'open' } : x
                        )
                    )
                    // rollback handled locally
                    toast({
                        title: 'Payment failed',
                        description: 'Could not record payment',
                        variant: 'destructive',
                    })
                })
                .finally(() => {
                    setPayLoading(false)
                    setPayMethodLoading(null)
                })
            return
        } catch (e) {
            console.error('Payment failed', e)
            toast({
                title: 'Payment failed',
                description: 'Could not record payment',
                variant: 'destructive',
            })
        } finally {
            setPayLoading(false)
            setPayMethodLoading(null)
        }
    }

    // Cart helpers
    const ticketCart = selectedTicket ? cartByTicket[selectedTicket] || [] : []
    const cartSubtotal = useMemo(
        () =>
            ticketCart.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            ),
        [ticketCart]
    )
    const cartTaxRate = useMemo(() => {
        if (!selectedTicket) return 0
        const t = tickets.find((x) => x.ticketId === selectedTicket)
        return t ? getTicketTaxRatePercent(t) : 0
    }, [selectedTicket, tickets])
    const cartTaxAmount = useMemo(
        () => (cartSubtotal * cartTaxRate) / 100,
        [cartSubtotal, cartTaxRate]
    )
    const cartTotal = useMemo(
        () => cartSubtotal + cartTaxAmount,
        [cartSubtotal, cartTaxAmount]
    )
    const startPayFlow = useCallback(async () => {
        if (!selectedTicket || cartTotal <= 0) return
        try {
            const itemsToSave = cartByTicket[selectedTicket] || ticketCart
            if (itemsToSave.length > 0) {
                await dbSaveCart(selectedTicket, itemsToSave)
            }
        } catch {
            /* noop */
        }
        openPayDialog(selectedTicket)
    }, [selectedTicket, cartTotal, cartByTicket, ticketCart, openPayDialog])
    useEffect(() => {
        if (!mobileSelectedCartKey) return
        const exists = ticketCart.some(
            (ci, idx) => `${ci.id}-${idx}` === mobileSelectedCartKey
        )
        if (!exists) setMobileSelectedCartKey(null)
    }, [ticketCart, mobileSelectedCartKey])
    useEffect(() => {
        setMobileSelectedCartKey(null)
    }, [selectedTicket])
    // Quick lookup for per-item quantities in the active ticket
    const qtyByItemId = useMemo(() => {
        const map: Record<string, number> = {}
        for (const it of ticketCart) {
            map[it.id] = (map[it.id] || 0) + (it.quantity || 0)
        }
        return map
    }, [ticketCart])
    // totals helpers moved earlier
    const hasZeroOpenTicket = useMemo(
        () => openTickets.some((t) => ticketTotalNumber(t) === 0),
        [openTickets, cartByTicket]
    )
    const cartCount = useMemo(
        () => ticketCart.reduce((n, i) => n + i.quantity, 0),
        [ticketCart]
    )
    const openedAtLabel = useMemo(() => {
        if (!activeTicket) return '--'
        const locale = settings.locale || 'en-US'
        const formatTime = (value: Date) => {
            if (!Number.isFinite(value.getTime())) return null
            try {
                return value.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            } catch {
                try {
                    return value.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                } catch {}
            }
            return null
        }
        const rawMs = activeTicket.openedAtMs
        if (typeof rawMs === 'number' && Number.isFinite(rawMs)) {
            const formatted = formatTime(new Date(rawMs))
            if (formatted) return formatted
        }
        const fallback = String(activeTicket.openedAt ?? '').trim()
        if (fallback) {
            const parsed = formatTime(new Date(fallback))
            if (parsed) return parsed
            const match = fallback.match(
                /(\d{1,2}:\d{2}\s?[AP]M|\d{1,2}:\d{2})/
            )
            if (match) return match[1]
            return fallback
        }
        return '--'
    }, [activeTicket, settings.locale])
    const coversDisplay = activeTicket?.covers ?? null
    const coversCount = useMemo(() => {
        const parsed = Math.floor(Number(coversDraft))
        if (Number.isFinite(parsed) && parsed > 0) return parsed
        return 1
    }, [coversDraft])
    const decrementCoversDraft = () => {
        setCoversDraft(String(Math.max(1, coversCount - 1)))
    }
    const incrementCoversDraft = () => {
        setCoversDraft(String(coversCount + 1))
    }
    const noteRaw = activeTicket?.notes?.trim() ?? ''
    const notePreview =
        noteRaw.length > 0
            ? noteRaw.length > 60
                ? `${noteRaw.slice(0, 60)}…`
                : noteRaw
            : null

    const goToTickets = () => setCurrentView('tickets')
    const goToPOS = () => {
        if (!selectedTicket) {
            toast({
                title: 'No ticket selected',
                description: 'Select or open a ticket first',
                variant: 'destructive',
            })
            return
        }
        setCurrentView('pos')
    }

    // Default view based on route: /tickets shows the ticket list; otherwise POS

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const path = window.location.pathname || ''
                if (path.endsWith('/tickets')) setCurrentView('tickets')
                else setCurrentView('pos')
            } catch {}
            let requestedNewTicket = false
            try {
                if (typeof localStorage !== 'undefined') {
                    const flag = localStorage.getItem('posRequestNewTicket')
                    if (flag === '1') {
                        localStorage.removeItem('posRequestNewTicket')
                        requestedNewTicket = true
                    }
                }
                const url = new URL(window.location.href)
                if (url.searchParams.has('newTicket')) {
                    requestedNewTicket = true
                    url.searchParams.delete('newTicket')
                    const qs = url.searchParams.toString()
                    window.history.replaceState(
                        null,
                        '',
                        url.pathname + (qs ? `?${qs}` : '')
                    )
                }
            } catch {
                /* ignore */
            }
            if (requestedNewTicket) {
                void handleNewTicket()
                return
            }
        }

        if (selectedTicket) return

        const cookieSel = readCookie('selectedTicket')
        if (cookieSel) {
            updateSelectedTicket(cookieSel)
            loadTicketCart(cookieSel)
            return
        }

        const zeros = openTickets.filter((t) => ticketTotalNumber(t) === 0)
        if (zeros.length > 0) {
            const parseNum = (id: string) => {
                const m = String(id).match(/(\d+)/g)
                if (!m) return Number.MAX_SAFE_INTEGER
                const last = m[m.length - 1]
                return parseInt(last, 10)
            }
            const chosen = zeros
                .slice()
                .sort((a, b) => parseNum(a.ticketId) - parseNum(b.ticketId))[0]
            updateSelectedTicket(chosen.ticketId)
            loadTicketCart(chosen.ticketId)
            return
        }
    }, [openTickets, selectedTicket])

    // Highest-priority: if arriving with a pay intent, open the payment dialog immediately
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const url = new URL(window.location.href)
            const payIdFromQuery = url.searchParams.get('pay')
            const payIdFromLS =
                typeof localStorage !== 'undefined'
                    ? localStorage.getItem('posOpenPay')
                    : null
            const payId = payIdFromQuery || payIdFromLS
            if (payId) {
                if (payIdFromLS) {
                    try {
                        localStorage.removeItem('posOpenPay')
                    } catch {}
                }
                setCurrentView('pos')
                updateSelectedTicket(payId)
                loadTicketCart(payId)
                setPayTicketId(payId)
                setPayDialogOpen(true)
            }
        } catch {}
    }, [])

    const addToCart = (menuItem: MenuItem) => {
        if (!selectedTicket) return
        pushMenuItemToTicket(selectedTicket, menuItem)
    }

    const handleMenuItemSelect = (menuItem: MenuItem) => {
        if (!selectedTicket) {
            setPendingMenuAutoAdd(false)
            setPendingMenuItem(menuItem)
            setOpenTicketPromptOpen(true)
            return
        }
        addToCart(menuItem)
    }

    // Listen for header search adds and mirror in local cart
    useEffect(() => {
        const onAdded = (e: any) => {
            try {
                const detail = e?.detail || {}
                const tId = String(detail.ticketId || '')
                if (!selectedTicket || tId !== selectedTicket) return
                const name = String(detail.name || '')
                const price = Number(detail.price || 0) || 0
                if (!name) return
                const key = normalize(name)
                const menu = menuItems.find((m) => normalize(m.name) === key)
                const item: MenuItem = menu
                    ? { ...menu, price }
                    : ({
                          id: name,
                          name,
                          description: '',
                          image: '',
                          category: '',
                          price,
                      } as any)
                addToCart(item)
            } catch {}
        }
        window.addEventListener('pos:added-item', onAdded as any)
        return () =>
            window.removeEventListener('pos:added-item', onAdded as any)
    }, [selectedTicket, menuItems])

    const updateQty = (id: string, qty: number) => {
        if (!selectedTicket) return
        setCartByTicket((prev) => {
            const current = prev[selectedTicket] || []
            const minQty = savedQtyByTicket[selectedTicket]?.[id] ?? 0
            const clamped = Math.max(qty, minQty)
            const updated =
                clamped <= 0
                    ? current.filter((i) => i.id !== id)
                    : current.map((i) =>
                          i.id === id ? { ...i, quantity: clamped } : i
                      )
            return { ...prev, [selectedTicket]: updated }
        })
    }

    const handleSaveItems = async () => {
        if (!selectedTicket) return
        if (ticketCart.length === 0) {
            toast({
                title: 'Cart is empty',
                description: 'Add items before saving',
                variant: 'destructive',
            })
            return
        }
        try {
            setSaving(true)
            const itemsToSave = cartByTicket[selectedTicket] || ticketCart
            // Persist all items in one local DB transaction
            await dbSaveCart(selectedTicket, itemsToSave)
            setSavedQtyByTicket((prev) => ({
                ...prev,
                [selectedTicket]: Object.fromEntries(
                    itemsToSave.map((it) => [it.id, it.quantity])
                ),
            }))
            toast({
                title: 'Ticket saved',
                description: `Items saved to ${selectedTicket}`,
            })
            // Notify other tabs (liveQuery updates local state)
            fetchOpenTickets()
            try {
                broadcastUpdate('tickets')
            } catch {}
            router.push('/tickets')
        } catch (e) {
            console.error('Failed to save items', e)
            toast({
                title: 'Save failed',
                description: 'Could not save ticket items',
                variant: 'destructive',
            })
        } finally {
            setSaving(false)
        }
    }

    // Initial data load
    useEffect(() => {
        if (tenantLoading) return

        async function loadMenuAndCategories() {
            const [menuRows, catRows] = await Promise.all([
                dbListMenu(),
                dbListCategories(),
            ])
            const menuArr: MenuItem[] = menuRows.map((m: any) => {
                const parsedOptions = parseInventoryOptions(m.options)
                const options = hasOptionStructure(parsedOptions)
                    ? parsedOptions
                    : undefined
                return {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    price: m.price,
                    image: m.image,
                    category: m.category,
                    options,
                }
            })
            const catArr: Category[] = catRows
                .map((c: any) => ({
                    id: c.id,
                    label: c.label,
                    icon: c.icon || '',
                    value: c.value,
                }))
                .sort((a, b) =>
                    (a.label || '').localeCompare(b.label || '', undefined, {
                        sensitivity: 'base',
                    })
                )
            setMenuItems(menuArr)
            setCategories(catArr)
            setActiveCategory((prev) => {
                if (prev === undefined) return prev
                const prevNorm = normalize(prev)
                const exists = catArr.some(
                    (c) => normalize(categoryKey(c) ?? '') === prevNorm
                )
                return exists ? prev : undefined
            })
        }

        ;(async () => {
            try {
                const role = readCookie('role')
                setIsAdmin(role === 'admin')
            } catch {}

            if (!isTenantBootstrapped) {
                setMenuItems([])
                setCategories([])
                setActiveCategory(undefined)
                await fetchOpenTickets()
                return
            }

            try {
                await loadMenuAndCategories()
            } catch (e) {
                console.error('Failed to load menu/categories', e)
                toast({
                    title: 'Load failed',
                    description: 'Could not load menu or categories',
                    variant: 'destructive',
                })
            }

            await fetchOpenTickets()
        })()
    }, [tenantLoading, isTenantBootstrapped, toast])

    // Clean up the pay param once mounted (optional)
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const url = new URL(window.location.href)
            if (url.searchParams.has('pay')) {
                url.searchParams.delete('pay')
                const qs = url.searchParams.toString()
                window.history.replaceState(
                    null,
                    '',
                    url.pathname + (qs ? '?' + qs : '')
                )
            }
        } catch {}
    }, [])

    async function openVoidDialog() {
        if (!selectedTicket) return
        try {
            const items = await dbGetTicketItems(selectedTicket)
            if (!items.length) {
                toast({
                    title: 'No saved items',
                    description: 'Save the ticket first.',
                    variant: 'destructive',
                })
                return
            }
            setVoidItems(
                items.map((i) => ({
                    name: i.name,
                    qty: Number(i.qty || 0) || 0,
                }))
            )
            setVoidItemName(items[0].name)
            setVoidMaxQty(Number(items[0].qty || 0) || 0)
            setVoidQty('1')
            let users = await listUsersLocal()
            let admins = users.filter(
                (u) => (u.role || '').toLowerCase() === 'admin'
            )
            if (admins.length === 0) {
                try {
                    await syncAllUsersFromRemote()
                    users = await listUsersLocal()
                    admins = users.filter(
                        (u) => (u.role || '').toLowerCase() === 'admin'
                    )
                } catch {}
            }
            setApprovers(
                admins.map((u) => ({ id: u.id, name: u.name || u.id }))
            )
            setVoidApprover(admins[0]?.id || '')
            setVoidReason('')
            setOptionsOpen(false)
            setVoidOpen(true)
        } catch (e) {
            toast({
                title: 'Error',
                description: 'Could not load ticket items',
                variant: 'destructive',
            })
        }
    }

    async function submitVoidRequest() {
        if (!selectedTicket) return
        const qty = Number(voidQty)
        if (
            !voidItemName.trim() ||
            !isFinite(qty) ||
            qty <= 0 ||
            qty > voidMaxQty ||
            !voidApprover ||
            !voidReason.trim()
        ) {
            toast({
                title: 'Incomplete',
                description: 'Select item, valid qty, approver, and reason.',
                variant: 'destructive',
            })
            return
        }
        try {
            const t = tickets.find((t) => t.ticketId === selectedTicket)
            await createVoidRequest({
                ticketId: selectedTicket,
                ticketName: t?.ticketName,
                itemName: voidItemName,
                requestedQty: qty,
                approverId: voidApprover,
                reason: voidReason,
            })
            setVoidOpen(false)
            toast({
                title: 'Request sent',
                description: 'Void request is pending approval.',
            })
        } catch (e) {
            toast({
                title: 'Failed',
                description: 'Could not create request',
                variant: 'destructive',
            })
        }
    }
    const activeKeyNorm = normalize(activeCategory)
    const baseMenu: MenuItem[] = Array.isArray(menuItems)
        ? menuItems
        : ([] as any)
    const itemsForCategory = baseMenu.filter((m) => {
        if (!activeKeyNorm) return true
        const itemKeyNorm = normalize(m.category)
        return itemKeyNorm === activeKeyNorm
    })

    if (!tenantLoading && !isTenantBootstrapped) {
        return (
            <div className="sm:py-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Welcome to the POS
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Finish the onboarding walkthrough to configure your store
                    before taking orders.
                </p>
            </div>
        )
    }

    const categoryRail = (
        <div className="sticky top-[5.25rem] z-30 rounded-2xl border border-gray-200 bg-white/95 px-3 py-3 shadow-md backdrop-blur dark:border-gray-800/80 dark:bg-gray-900/90 sm:px-4 lg:px-6">
            <div className="mx-1 space-y-3 md:mx-0 md:space-y-0">
                {showNavGrid && (
                    <div className="md:hidden px-1">
                        <MobileNavGrid />
                    </div>
                )}
                <div className="px-4 md:px-0">
                    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="inline-flex h-11 w-full flex-nowrap gap-0.5 rounded-lg bg-gray-100 p-0.5 sm:w-auto lg:min-w-fit dark:bg-gray-900">
                            <button
                                className={`h-10 flex-1 rounded-md px-2 py-2 text-xs font-medium transition whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-900 sm:px-3 sm:text-sm lg:flex-initial ${
                                    activeCategory === undefined
                                        ? 'shadow-theme-xs bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                }`}
                                onClick={() => setActiveCategory(undefined)}
                            >
                                All
                            </button>
                            {categories.map((c) => {
                                const isActive =
                                    normalize(activeCategory) ===
                                    normalize(categoryKey(c))
                                return (
                                    <button
                                        key={c.id}
                                        className={`h-10 flex-1 rounded-md px-2 py-2 text-xs font-medium transition whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-900 sm:px-3 sm:text-sm lg:flex-initial ${
                                            isActive
                                                ? 'shadow-theme-xs bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                        }`}
                                        onClick={() =>
                                            setActiveCategory(
                                                categoryKey(c) ?? ''
                                            )
                                        }
                                    >
                                        {c.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    return (
        <div className="contents">
            <div className="sm:py-6">
                <div className="px-2 sm:px-3 lg:px-6">
                    <div className="space-y-4">
                        {categoryRail}
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-12 lg:col-span-8">
                                <div className="rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm ring-1 ring-black/5 dark:border-gray-800/70 dark:bg-gray-950/70 dark:ring-white/10 sm:p-4 lg:p-6">
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                        {itemsForCategory.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                                                onClick={() =>
                                                    handleMenuItemSelect(item)
                                                }
                                                aria-disabled={!selectedTicket}
                                            >
                                                <div className="w-full bg-gray-100 dark:bg-gray-800 aspect-square">
                                                    {item.image ? (
                                                        <img
                                                            src={item.image}
                                                            alt={item.name}
                                                            width={320}
                                                            height={320}
                                                            className="block h-full w-full object-cover"
                                                            style={{
                                                                aspectRatio:
                                                                    '1 / 1',
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                                                            No image
                                                        </div>
                                                    )}
                                                    {(() => {
                                                        const q =
                                                            qtyByItemId[
                                                                item.id
                                                            ] || 0
                                                        return q > 0 ? (
                                                            <span className="absolute right-2 top-2 z-10 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold leading-none text-white shadow">
                                                                {q}
                                                            </span>
                                                        ) : null
                                                    })()}
                                                </div>
                                                <div className="p-3">
                                                    <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatCurrency(
                                                            item.price
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                        {itemsForCategory.length === 0 && (
                                            <div className="col-span-full text-sm text-gray-500 dark:text-gray-400">
                                                No items in this category.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-12 lg:col-span-4">
                                <div className="hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:block lg:sticky lg:top-[5.25rem]">
                                    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Order#:{' '}
                                                {activeTicket
                                                    ? activeTicketLabel ||
                                                      'Ticket'
                                                    : 'Ticket'}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-200">
                                                    Covers:{' '}
                                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                                        {coversDisplay != null
                                                            ? coversDisplay
                                                            : '--'}
                                                    </span>
                                                </span>
                                                <span
                                                    className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-200"
                                                    title={
                                                        notePreview
                                                            ? (
                                                                  activeTicket?.notes ??
                                                                  ''
                                                              )
                                                            : 'No notes'
                                                    }
                                                >
                                                    Note:{' '}
                                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                                        {notePreview ?? '--'}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        {activeTicket ? null : (
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                Add menu items to the ticket.
                                            </div>
                                        )}
                                        {activeTicket ? (
                                            ticketCart.length === 0 ? (
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    No items added.
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                        {ticketCart.map((ci, idx) => (
                                            <div
                                                key={`${ci.id}-${idx}`}
                                                className="flex items-center justify-between gap-3"
                                            >
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                        {ci.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatCurrency(
                                                            ci.price
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        className="h-7 w-7 rounded-md border border-gray-300 text-sm dark:border-gray-700 disabled:opacity-50"
                                                        onClick={() =>
                                                            updateQty(
                                                                ci.id,
                                                                ci.quantity - 1
                                                            )
                                                        }
                                                        disabled={
                                                            (savedQtyByTicket[
                                                                selectedTicket ||
                                                                    ''
                                                            ]?.[ci.id] ?? 0) >=
                                                            ci.quantity
                                                        }
                                                    >
                                                        -
                                                    </button>
                                                    <span className="min-w-[2ch] text-center text-sm text-gray-800 dark:text-gray-200">
                                                        {ci.quantity}
                                                    </span>
                                                    <button
                                                        className="h-7 w-7 rounded-md border border-gray-300 text-sm dark:border-gray-700"
                                                        onClick={() =>
                                                            updateQty(
                                                                ci.id,
                                                                ci.quantity + 1
                                                            )
                                                        }
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : null}
                            {activeTicket ? (
                                <div className="mt-4 space-y-1 border-t pt-3 text-sm dark:border-gray-800">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            Subtotal
                                        </span>
                                        <span className="text-gray-900 dark:text-white">
                                            {formatCurrency(cartSubtotal)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            Tax ({cartTaxRate}%)
                                        </span>
                                        <span className="text-gray-900 dark:text-white">
                                            {formatCurrency(cartTaxAmount)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between font-medium">
                                        <span className="text-gray-700 dark:text-gray-200">
                                            Total
                                        </span>
                                        <span className="text-gray-900 dark:text-white">
                                            {formatCurrency(cartTotal)}
                                        </span>
                                    </div>
                                    <div className="mt-4 space-y-1 border-t pt-3 text-sm dark:border-gray-800">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                Opened By
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {activeTicket.openedBy || '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                Opened At
                                            </span>
                                            <span className="text-sm text-gray-900 dark:text-gray-100">
                                                {openedAtLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            <div className="mt-3 grid gap-2">
                                <Button
                                    variant="primary"
                                    className="w-full"
                                    onClick={startPayFlow}
                                    disabled={!selectedTicket || cartTotal <= 0}
                                >
                                    Pay
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleSaveItems}
                                    disabled={saving || ticketCart.length === 0}
                                >
                                    {saving ? 'Saving...' : 'Save Ticket'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={openOptionsDialog}
                                    disabled={!selectedTicket}
                                >
                                    Options
                                </Button>
                            </div>
                        </div>
                    </div>
                    {activeTicket ? (
                        <div className="lg:hidden">
                            <div
                                className="pointer-events-none fixed inset-x-0 z-40 px-3 pb-4"
                                style={{
                                    bottom: 'calc(4.5rem + env(safe-area-inset-bottom))',
                                }}
                            >
                                <div className="pointer-events-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-950">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {activeTicketLabel || 'Ticket'}
                                        </span>
                                    </div>
                                    <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
                                        {ticketCart.length === 0 ? (
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                No items added.
                                            </div>
                                        ) : (
                                            ticketCart.map((ci, idx) => {
                                                const lockedQty =
                                                    savedQtyByTicket[
                                                        selectedTicket || ''
                                                    ]?.[ci.id] ?? 0
                                                const cartKey = `${ci.id}-${idx}`
                                                const isSelected =
                                                    cartKey ===
                                                    mobileSelectedCartKey
                                                return (
                                                    <div
                                                        key={cartKey}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() =>
                                                            setMobileSelectedCartKey(
                                                                isSelected
                                                                    ? null
                                                                    : cartKey
                                                            )
                                                        }
                                                        onKeyDown={(event) => {
                                                            if (
                                                                event.key ===
                                                                    'Enter' ||
                                                                event.key ===
                                                                    ' '
                                                            ) {
                                                                event.preventDefault()
                                                                setMobileSelectedCartKey(
                                                                    isSelected
                                                                        ? null
                                                                        : cartKey
                                                                )
                                                            }
                                                        }}
                                                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                                                            isSelected
                                                                ? 'border-primary/40 bg-primary/5'
                                                                : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                                                        }`}
                                                        aria-pressed={
                                                            isSelected
                                                        }
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {ci.name}
                                                            </div>
                                                        </div>
                                                        {isSelected ? (
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="h-8 w-8 rounded-md border border-gray-300 text-base leading-none dark:border-gray-700 disabled:opacity-50"
                                                                    onClick={(
                                                                        event
                                                                    ) => {
                                                                        event.stopPropagation()
                                                                        updateQty(
                                                                            ci.id,
                                                                            ci.quantity -
                                                                                1
                                                                        )
                                                                    }}
                                                                    onKeyDown={(
                                                                        event
                                                                    ) => {
                                                                        event.stopPropagation()
                                                                    }}
                                                                    disabled={
                                                                        lockedQty >=
                                                                        ci.quantity
                                                                    }
                                                                    aria-label={`Decrease ${ci.name}`}
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="min-w-[2ch] text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                                    {
                                                                        ci.quantity
                                                                    }
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="h-8 w-8 rounded-md border border-gray-300 text-base leading-none dark:border-gray-700"
                                                                    onClick={(
                                                                        event
                                                                    ) => {
                                                                        event.stopPropagation()
                                                                        updateQty(
                                                                            ci.id,
                                                                            ci.quantity +
                                                                                1
                                                                        )
                                                                    }}
                                                                    onKeyDown={(
                                                                        event
                                                                    ) => {
                                                                        event.stopPropagation()
                                                                    }}
                                                                    aria-label={`Increase ${ci.name}`}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                                                Qty{' '}
                                                                {ci.quantity}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Total {formatCurrency(cartTotal)}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {openedAtLabel}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <Button
                                            variant="primary"
                                            className="flex-[4]"
                                            onClick={handleSaveItems}
                                            disabled={
                                                saving ||
                                                ticketCart.length === 0
                                            }
                                        >
                                            {saving
                                                ? 'Saving...'
                                                : 'Save Ticket'}
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex h-12 flex-1 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                                    aria-label="More ticket actions"
                                                >
                                                    <HorizontaLDots className="h-5 w-5" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                className="w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                                            >
                                                <DropdownMenuItem
                                                    onSelect={() => {
                                                        if (
                                                            !selectedTicket ||
                                                            cartTotal <= 0
                                                        )
                                                            return
                                                        void startPayFlow()
                                                    }}
                                                    disabled={
                                                        !selectedTicket ||
                                                        cartTotal <= 0
                                                    }
                                                >
                                                    Pay
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onSelect={() => {
                                                        if (!selectedTicket)
                                                            return
                                                        openOptionsDialog()
                                                    }}
                                                    disabled={!selectedTicket}
                                                >
                                                    Options
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            </div>

            <Modal
            isOpen={openTicketPromptOpen}
            onClose={() => {
                setOpenTicketPromptOpen(false)
                resetPendingMenuIntent()
            }}
            className="max-w-sm !min-h-[14rem]"
            bodyClassName="gap-0 px-5 py-5 sm:px-6 sm:py-6"
        >
            <div className="flex-1 space-y-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Open a ticket?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    You'll need an open ticket to add{' '}
                    {pendingMenuItem?.name ?? 'this item'}.
                </p>
            </div>
            <div className="mt-auto flex justify-end gap-3 pt-4">
                <Button
                    variant="outline"
                    onClick={() => {
                        setOpenTicketPromptOpen(false)
                        resetPendingMenuIntent()
                    }}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={() => {
                        if (creatingTicket || !pendingMenuItem) return
                        setOpenTicketPromptOpen(false)
                        setPendingMenuAutoAdd(true)
                        void handleNewTicket()
                    }}
                    disabled={creatingTicket}
                >
                    {creatingTicket ? 'Opening…' : 'Open Ticket'}
                </Button>
            </div>
            </Modal>

            <Modal
            isOpen={newTicketDialogOpen}
            onClose={() => {
                if (!newTicketSubmitting) {
                    setNewTicketDialogOpen(false)
                    resetPendingMenuIntent()
                }
            }}
            className="max-w-sm p-6"
        >
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Open Ticket
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Set the guest count and optional note before
                                    opening.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Covers
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    value={newTicketCovers}
                                    onChange={(e) =>
                                        setNewTicketCovers(e.target.value)
                                    }
                                    placeholder="Number of guests"
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                    disabled={newTicketSubmitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Note (optional)
                                </label>
                                <textarea
                                    rows={3}
                                    value={newTicketNote}
                                    onChange={(e) =>
                                        setNewTicketNote(e.target.value)
                                    }
                                    placeholder="Add any ticket or guest notes"
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                    disabled={newTicketSubmitting}
                                />
                            </div>
                            {newTicketError && (
                                <div className="text-sm text-red-600 dark:text-red-400">
                                    {newTicketError}
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (!newTicketSubmitting) {
                                            setNewTicketDialogOpen(false)
                                            resetPendingMenuIntent()
                                        }
                                    }}
                                    disabled={newTicketSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={confirmNewTicket}
                                    disabled={newTicketSubmitting}
                                >
                                    {newTicketSubmitting
                                        ? 'Opening…'
                                        : 'Open Ticket'}
                                </Button>
                            </div>
                        </div>
                    </Modal>

                    {/* Pay Dialog */}
                    <Modal
                        isOpen={payDialogOpen}
                        onClose={() => setPayDialogOpen(false)}
                        className="max-w-md p-6"
                    >
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Record Payment
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Choose a method to close the ticket.
                                </p>
                            </div>

                            {(() => {
                                const t = payTicketId
                                    ? tickets.find(
                                          (tk) => tk.ticketId === payTicketId
                                      )
                                    : null
                                const due = t ? ticketTotalNumber(t) : 0
                                return (
                                    <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                        Total Due:{' '}
                                        <span className="font-medium">
                                            {formatCurrency(due)}
                                        </span>
                                    </div>
                                )
                            })()}

                            {!paySelectedMethod ? (
                                <div className="grid grid-cols-3 gap-2">
                                    <Button
                                        variant="outline"
                                        disabled={payLoading}
                                        onClick={() => startCashFlow()}
                                    >
                                        Cash
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={payLoading}
                                        onClick={() => handlePay('Card')}
                                    >
                                        {payMethodLoading === 'Card'
                                            ? 'Processing…'
                                            : 'Card'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={payLoading}
                                        onClick={() => handlePay('PromptPay')}
                                    >
                                        {payMethodLoading === 'PromptPay'
                                            ? 'Processing…'
                                            : 'PromptPay'}
                                    </Button>
                                </div>
                            ) : paySelectedMethod === 'Cash' ? (
                                <div className="space-y-3">
                                    <label className="block text-sm text-gray-600 dark:text-gray-300">
                                        Cash received
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                        value={cashCollected}
                                        onChange={(e) =>
                                            setCashCollected(e.target.value)
                                        }
                                        placeholder="0.00"
                                        disabled={payLoading}
                                    />
                                    {(() => {
                                        const t = payTicketId
                                            ? tickets.find(
                                                  (tk) =>
                                                      tk.ticketId ===
                                                      payTicketId
                                              )
                                            : null
                                        const due = t ? ticketTotalNumber(t) : 0
                                        const tendered = parseFloat(
                                            cashCollected || ''
                                        )
                                        const isNum = Number.isFinite(tendered)
                                        const change = isNum
                                            ? tendered - due
                                            : NaN
                                        const cls =
                                            !isNum || change < 0
                                                ? 'text-red-600'
                                                : 'text-green-600'
                                        const display = isNum
                                            ? formatCurrency(change)
                                            : '--'
                                        return (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-300">
                                                    Change
                                                </span>
                                                <span
                                                    className={`font-medium ${cls}`}
                                                >
                                                    {display}
                                                </span>
                                            </div>
                                        )
                                    })()}
                                    {cashError && (
                                        <div className="text-sm text-red-600">
                                            {cashError}
                                        </div>
                                    )}
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setPayDialogOpen(false)
                                            }
                                            disabled={payLoading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={confirmCashPayment}
                                            disabled={
                                                payLoading ||
                                                (() => {
                                                    const t = payTicketId
                                                        ? tickets.find(
                                                              (tk) =>
                                                                  tk.ticketId ===
                                                                  payTicketId
                                                          )
                                                        : null
                                                    const due = t
                                                        ? ticketTotalNumber(t)
                                                        : 0
                                                    const tendered = parseFloat(
                                                        cashCollected || ''
                                                    )
                                                    return !(
                                                        Number.isFinite(
                                                            tendered
                                                        ) && tendered >= due
                                                    )
                                                })()
                                            }
                                        >
                                            {payLoading
                                                ? 'Recording…'
                                                : 'Confirm Cash'}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Modal>

                    {/* Options Dialog */}
                    <Modal
                        isOpen={optionsOpen}
                        onClose={() => setOptionsOpen(false)}
                        className="max-w-md p-6"
                    >
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Ticket Options
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Update guest details or request additional
                                    actions.
                                </p>
                            </div>
                            {activeTicket ? (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Covers
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                                onClick={decrementCoversDraft}
                                                aria-label="Decrease covers"
                                                disabled={
                                                    savingDetails ||
                                                    !activeTicket ||
                                                    coversCount <= 1
                                                }
                                            >
                                                -
                                            </button>
                                            <span className="min-w-[3rem] text-center text-base font-semibold text-gray-900 dark:text-gray-100">
                                                {coversCount}
                                            </span>
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                                onClick={incrementCoversDraft}
                                                aria-label="Increase covers"
                                                disabled={
                                                    savingDetails ||
                                                    !activeTicket
                                                }
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Note
                                        </label>
                                        <textarea
                                            rows={4}
                                            value={noteDraft}
                                            onChange={(e) =>
                                                setNoteDraft(e.target.value)
                                            }
                                            placeholder="Add ticket or guest notes"
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                            disabled={
                                                savingDetails || !activeTicket
                                            }
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setOptionsOpen(false)
                                            }
                                            disabled={savingDetails}
                                        >
                                            Close
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={handleSaveTicketDetails}
                                            disabled={
                                                savingDetails ||
                                                !selectedTicket ||
                                                !activeTicket
                                            }
                                        >
                                            {savingDetails
                                                ? 'Saving…'
                                                : 'Save Changes'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                    Select a ticket to edit its details.
                                </div>
                            )}
                            <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Other actions
                                </p>
                                <button
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                                    onClick={openVoidDialog}
                                    disabled={!selectedTicket}
                                >
                                    Request Void
                                </button>
                            </div>
                        </div>
                    </Modal>

                    {/* Request Void Dialog */}
                    <Modal
                        isOpen={voidOpen}
                        onClose={() => setVoidOpen(false)}
                        className="max-w-md p-6"
                    >
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Request Void
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Select an item, quantity, approver and
                                    provide a reason.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">
                                    Item
                                </label>
                                <select
                                    className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    value={voidItemName}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setVoidItemName(v)
                                        const m = voidItems.find(
                                            (i) => i.name === v
                                        )
                                        setVoidMaxQty(m ? m.qty : 0)
                                    }}
                                >
                                    {voidItems.map((it) => (
                                        <option
                                            key={`${it.name}-${it.qty}`}
                                            value={it.name}
                                        >
                                            {it.name} (max {it.qty})
                                        </option>
                                    ))}
                                </select>
                                <div>
                                    <label className="text-xs text-muted-foreground">
                                        Quantity (max {voidMaxQty})
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        max={voidMaxQty}
                                        className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                        value={voidQty}
                                        onChange={(e) =>
                                            setVoidQty(e.target.value)
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground">
                                        Approver
                                    </label>
                                    <select
                                        className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                        value={voidApprover}
                                        onChange={(e) =>
                                            setVoidApprover(e.target.value)
                                        }
                                    >
                                        {approvers.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">
                                    Reason
                                </label>
                                <textarea
                                    className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    rows={3}
                                    value={voidReason}
                                    onChange={(e) =>
                                        setVoidReason(e.target.value)
                                    }
                                    placeholder="Describe why this item should be voided"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
                                    onClick={() => setVoidOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="rounded-md border border-gray-300 bg-gray-900 px-3 py-1.5 text-sm text-white dark:border-gray-700 dark:bg-white dark:text-gray-900"
                                    onClick={submitVoidRequest}
                                >
                                    Submit Request
                                </button>
                            </div>
                        </div>
                    </Modal>
        </div>
    )
}
