import type {
    InventoryOptionGroup,
    InventoryOptionIngredient,
} from '@/lib/inventory-options'

export interface Category {
    id: string
    label: string
    icon: string
    value: string // <-- make sure this is a string, not a function
}

export interface MenuItem {
    id: string
    name: string
    description: string
    price: number
    image: string
    category: string
    options?: InventoryOptionGroup[]
}

export interface SelectedCartOption {
    groupId: string
    groupName: string
    choiceId: string
    choiceName: string
    priceDelta: number
    ingredients: InventoryOptionIngredient[]
}

export interface CartItem extends MenuItem {
    quantity: number
    basePrice?: number
    variantKey?: string
    selectedOptions?: SelectedCartOption[]
    displayName?: string
}

export interface Cart {
    items: CartItem[]
    total: number
}

export interface Ticket {
    ticketId: string
    openedBy: string
    openedAt: string
    openedAtMs?: number | null
    price: string
    status: string
    date: string
    ticketName?: string
    covers?: number | null
    notes?: string | null
}
