import { useToast } from '@/hooks/use-toast'
import { CartItem, Category, MenuItem } from './types/pos'
import { useEffect, useMemo, useState } from 'react'
import { MenuItemCard } from './MenuItemCard'
import {
    listMenu as dbListMenu,
    listCategories as dbListCategories,
} from '@/lib/local-catalog'
import {
    listOpenTickets as dbListOpenTickets,
    openTicket as dbOpenTicket,
    saveCart as dbSaveCart,
    payTicket as dbPayTicket,
} from '@/lib/local-pos'

// GAS base is proxied via /api/gas; no direct base import needed

// ==========================
// Ticket API calls
// ==========================

{
    /* Menu Grid */
}
const MenuView = () => {
    const [categories, setCategories] = useState<Category[]>([])
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [activeCategory, setActiveCategory] = useState<string | undefined>(
        undefined
    )
    const [cartByTicket, setCartByTicket] = useState<
        Record<string, CartItem[]>
    >({})
    const [listOpenTickets, setOpenTickets] = useState<
        {
            ticketId: string
            ticketName: string
            openedBy: string
            openedAt: string
        }[]
    >([])

    const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    async function fetchOpenTickets() {
        try {
            const rows = await dbListOpenTickets()
            setOpenTickets(
                rows.map((r) => ({
                    ticketId: r.id,
                    ticketName: r.name,
                    openedBy: r.openedBy,
                    openedAt: new Date(r.openedAt).toISOString(),
                }))
            )
        } catch (err) {
            console.error('Failed to fetch open tickets:', err)
            setOpenTickets([])
        }
    }

    async function openTicket(openedBy: string) {
        return dbOpenTicket(openedBy) // { ticketId, openedAt, name }
    }

    async function saveCart(ticketId: string, items: CartItem[]) {
        await dbSaveCart(ticketId, items)
        return { ok: true }
    }

    async function closeTicket(
        ticketId: string,
        method: 'cash' | 'card' | 'promptPay' = 'cash'
    ) {
        const res = await dbPayTicket(ticketId, method)
        return { ticketId, total: res.amount }
    }

    // ==========================
    // Category & Menu
    // ==========================
    const addCategory = (newCategory: Category) => {
        setCategories((prev) => [...prev, newCategory])
        toast({
            title: 'Category added',
            description: `${newCategory.label} category created`,
        })
        setActiveCategory(newCategory.value)
    }

    const addItem = (newItem: MenuItem) => {
        setMenuItems((prev) => [...prev, newItem])
        toast({
            title: 'Item added',
            description: `${newItem.name} added to menu`,
        })
    }

    // ==========================
    // Cart
    // ==========================
    const filteredItems = useMemo(
        () => menuItems.filter((item) => item.category === activeCategory),
        [activeCategory, menuItems]
    )

    const cartTotal = useMemo(() => {
        if (!selectedTicket) return 0
        const ticketCart = cartByTicket[selectedTicket] || []
        return ticketCart.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        )
    }, [cartByTicket, selectedTicket])

    const addToCart = (menuItem: MenuItem) => {
        if (!selectedTicket) return

        setCartByTicket((prev) => {
            const ticketCart = prev[selectedTicket] || []
            const existingItem = ticketCart.find(
                (item) => item.id === menuItem.id
            )
            const updatedCart = existingItem
                ? ticketCart.map((item) =>
                      item.id === menuItem.id
                          ? { ...item, quantity: item.quantity + 1 }
                          : item
                  )
                : [...ticketCart, { ...menuItem, quantity: 1 }]
            // Persist to Dexie
            void saveCart(selectedTicket, updatedCart)
            return { ...prev, [selectedTicket]: updatedCart }
        })

        toast({
            title: 'Item added',
            description: `${menuItem.name} added to cart`,
        })
    }

    const updateQuantityForTicket = (itemId: string, newQuantity: number) => {
        if (!selectedTicket) return

        setCartByTicket((prev) => {
            const ticketCart = prev[selectedTicket] || []
            const updatedCart =
                newQuantity === 0
                    ? ticketCart.filter((item) => item.id !== itemId)
                    : ticketCart.map((item) =>
                          item.id === itemId
                              ? { ...item, quantity: newQuantity }
                              : item
                      )
            // Persist to Dexie
            void saveCart(selectedTicket, updatedCart)
            return { ...prev, [selectedTicket]: updatedCart }
        })
    }

    // ==========================
    // Checkout / Ticket Flow
    // ==========================
    const handleCheckout = async () => {
        if (!selectedTicket) {
            toast({
                title: 'No ticket selected',
                description: 'Select a ticket to add items.',
                variant: 'destructive',
            })
            return
        }

        const ticketCart = cartByTicket[selectedTicket] || []
        if (ticketCart.length === 0) {
            toast({
                title: 'Cart is empty',
                description: 'Add items to cart before checking out.',
                variant: 'destructive',
            })
            return
        }

        try {
            // Persist full cart locally
            await saveCart(selectedTicket, ticketCart)
            // Close the ticket locally (default cash; extend UI later)
            const { total } = await closeTicket(selectedTicket, 'cash')
            toast({
                title: 'Ticket closed',
                description: `Ticket #${selectedTicket} closed. Total: $${total}`,
            })

            setSelectedTicket(null)
            // Clear this ticket's cart in UI
            setCartByTicket((prev) => ({ ...prev, [selectedTicket]: [] }))
            fetchOpenTickets()
        } catch (err) {
            console.error('Checkout failed:', err)
            toast({
                title: 'Checkout failed',
                description: 'Could not save order to backend',
                variant: 'destructive',
            })
        }
    }

    // ==========================
    // Initial fetch
    // ==========================
    useEffect(() => {
        ;(async () => {
            try {
                setLoading(true)
                const [m, c] = await Promise.all([
                    dbListMenu(),
                    dbListCategories(),
                ])
                setMenuItems(
                    m.map((mi) => ({
                        id: mi.id,
                        name: mi.name,
                        description: mi.description,
                        price: mi.price,
                        image: mi.image,
                        category: mi.category,
                    }))
                )
                const cats = c.map((ci) => ({
                    id: ci.id,
                    label: ci.label,
                    icon: ci.icon || '',
                    value: ci.value,
                }))
                setCategories(cats)
                if (cats.length > 0) setActiveCategory(cats[0].value)
                await fetchOpenTickets()
            } catch (err) {
                console.error('Failed to load POS data:', err)
                toast({
                    title: 'Error loading data',
                    description:
                        'Could not load local menu, categories, or tickets',
                    variant: 'destructive',
                })
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
                {loading ? (
                    <div className="text-center text-muted-foreground py-12 text-lg">
                        Loading menu, categories, and tickets...
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredItems.map((item) => (
                                <MenuItemCard
                                    key={item.id}
                                    item={item}
                                    onAddToCart={addToCart}
                                />
                            ))}
                        </div>

                        {filteredItems.length === 0 && (
                            <div className="text-center text-muted-foreground py-12">
                                <p className="text-lg">
                                    No items available in this category
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
export default MenuView
