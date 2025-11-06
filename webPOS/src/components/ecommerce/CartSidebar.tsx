// CartSidebar.tsx
import { Badge } from '@/components/uiz/badge'
import { Button } from '@/components/uiz/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/uiz/card'
import { CartItem } from './types/pos'
import { CreditCard, Minus, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'

interface CartSidebarProps {
    items: CartItem[]
    total: number
    onUpdateQuantity: (itemId: string, quantity: number) => void
    onCheckout: () => void
    onOpenTickets: () => void
    onSaveTicket?: () => void
    hasActiveTicket?: boolean
    ticketSaved?: boolean // new
}

export function CartSidebar({
    items,
    total,
    onUpdateQuantity,
    onCheckout,
    onOpenTickets,
    onSaveTicket,
    hasActiveTicket = false,
}: CartSidebarProps) {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

    // Track whether the ticket has been saved
    const [ticketSaved, setTicketSaved] = useState(false)

    const handleButtonClick = async () => {
        if (hasActiveTicket && !ticketSaved) {
            // Step 1: Save ticket
            if (onSaveTicket) await onSaveTicket()
            setTicketSaved(true)
        } else {
            // Step 2: Open Tickets view
            setTicketSaved(false)
            onOpenTickets()
        }
    }

    return (
        <div className="w-80 bg-pos-sidebar border-l border-border h-full flex flex-col shadow-pos-cart">
            {/* Header */}
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                    <ShoppingCart className="h-5 w-5" />
                    Current Order
                    {itemCount > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>

            {/* Cart Items */}
            <CardContent
                className={`flex-1 overflow-y-auto px-4 ${ticketSaved ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {items.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No items in cart</p>
                        <p className="text-sm">Tap menu items to add</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <Card
                                key={item.id}
                                className="border border-border/50"
                            >
                                <CardContent className="p-3">
                                    {/* Item Row */}
                                    <div className="flex items-start gap-3">
                                        <img
                                            src={item.image}
                                            alt={item.name}
                                            className="w-12 h-12 rounded object-cover flex-shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-sm leading-tight">
                                                {item.name}
                                            </h4>
                                            <p className="text-primary font-semibold">
                                                ฿{item.price.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Qty Controls */}
                                    <div className="flex items-center justify-between mt-3">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    onUpdateQuantity(
                                                        item.id,
                                                        Math.max(
                                                            0,
                                                            item.quantity - 1
                                                        )
                                                    )
                                                }
                                                className="h-8 w-8 p-0"
                                                disabled={item.quantity <= 1}
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>

                                            <span className="font-medium w-8 text-center">
                                                {item.quantity}
                                            </span>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    onUpdateQuantity(
                                                        item.id,
                                                        item.quantity + 1
                                                    )
                                                }
                                                className="h-8 w-8 p-0"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>

                                        <span className="font-semibold">
                                            $
                                            {(
                                                item.price * item.quantity
                                            ).toFixed(2)}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Footer / Checkout */}
            <div className="p-4 border-t border-border mt-auto">
                {items.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold">Total</span>
                            <span className="text-2xl font-bold text-primary">
                                ${total.toFixed(2)}
                            </span>
                        </div>

                        <Button
                            onClick={onCheckout}
                            className="w-full min-h-touch bg-gradient-accent hover:opacity-90 text-lg font-semibold"
                            size="lg"
                        >
                            <CreditCard className="mr-2 h-5 w-5" />
                            Checkout
                        </Button>
                    </div>
                )}
                <Button
                    onClick={onSaveTicket}
                    className="w-full mt-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                >
                    {ticketSaved ? 'Open Tickets' : 'Save Ticket'}
                </Button>
            </div>
        </div>
    )
}
