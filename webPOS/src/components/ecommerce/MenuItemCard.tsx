import { Button } from '@/components/uiz/button'
import { Card, CardContent } from '@/components/uiz/card'
import { Plus } from 'lucide-react'
import { MenuItem } from './types/pos'

interface MenuItemCardProps {
    item: MenuItem
    onAddToCart: (item: MenuItem) => void
}

export function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
    const src = (() => {
        const url = String(item.image || '')
        if (!url) return ''
        try {
            const u = new URL(
                url,
                typeof window !== 'undefined'
                    ? window.location.origin
                    : 'https://bynd-pos.vercel.app'
            )
            const host = u.hostname
            if (
                host.includes('drive.google.com') ||
                host.includes('googleusercontent.com')
            ) {
                // Proxy through our API to avoid odd drive host variants and auth cookies
                const idParam = u.searchParams.get('id')
                if (idParam)
                    return `/api/drive?id=${encodeURIComponent(idParam)}`
                const m = u.pathname.match(/\/file\/d\/([^/]+)\//)
                if (m && m[1])
                    return `/api/drive?id=${encodeURIComponent(m[1])}`
            }
            return url
        } catch {
            return url
        }
    })()
    return (
        <Card className="bg-pos-item-bg hover:bg-pos-item-hover transition-colors duration-200 shadow-pos-item border-0 overflow-hidden cursor-pointer group">
            <CardContent className="p-0">
                <div className="relative aspect-square w-full flex-none overflow-hidden">
                    <img
                        src={src}
                        alt={item.name}
                        width={320}
                        height={320}
                        className="block h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        style={{ aspectRatio: '1 / 1' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>

                <div className="p-4 space-y-3">
                    <div className="min-h-[3rem] flex flex-col justify-start">
                        <h3 className="font-semibold text-foreground text-lg leading-tight">
                            {item.name}
                        </h3>
                        <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
                            {item.description}
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-primary">
                            {item.price.toFixed(2)}
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
