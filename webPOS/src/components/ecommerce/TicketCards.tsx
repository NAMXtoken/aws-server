import { Button } from '@/components/uiz/button'
import { Card, CardContent } from '@/components/uiz/card'
import { Ticket } from './types/pos'
import { Plus } from 'lucide-react'

interface TicketCardProps {
    item: Ticket
    onAddToCart: (item: Ticket) => void
}

export function TicketCard({ item, onAddToCart }: TicketCardProps) {
    return (
        <Card className="bg-pos-item-bg hover:bg-pos-item-hover transition-colors duration-200 shadow-pos-item border-0 overflow-hidden cursor-pointer group">
            <CardContent className="p-0">
                <div className="aspect-[4/3] relative overflow-hidden">
                    <img
                        src={item.date}
                        alt={item.status}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>

                <div className="p-4 space-y-3">
                    <div className="min-h-[3rem] flex flex-col justify-start">
                        <h3 className="font-semibold text-foreground text-lg leading-tight">
                            {item.openedAt}
                        </h3>
                        <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
                            {item.price}
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-primary">
                            ${Number(item.price || 0).toFixed(2)}
                        </span>
                        <Button
                            onClick={() => onAddToCart(item)}
                            size="sm"
                            className="min-h-touch min-w-touch bg-gradient-primary hover:opacity-90 transition-opacity rounded-full p-2"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
