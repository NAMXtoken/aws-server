import { Tabs, TabsList, TabsTrigger } from '@/components/uiz/tabs'
import {
    Cake,
    Clock,
    Coffee,
    IceCream,
    Pizza,
    Sandwich,
    Utensils,
    Wine,
} from 'lucide-react'
import { Category } from './types/pos'

interface CategoryTabsProps {
    categories: Category[]
    activeCategory: string
    onCategoryChange: (category: string) => void
}

const iconMap = {
    Utensils,
    Wine,
    Clock,
    Coffee,
    IceCream,
    Pizza,
    Sandwich,
    Cake,
}
export function CategoryTabs({
    categories,
    activeCategory,
    onCategoryChange,
}: CategoryTabsProps) {
    return (
        <Tabs
            value={activeCategory || ''}
            onValueChange={onCategoryChange}
            className="w-full"
        >
            <TabsList
                className={`grid w-full bg-muted h-14`}
                style={{
                    gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
                }}
            >
                {categories.map((category) => {
                    const Icon =
                        iconMap[category.icon as keyof typeof iconMap] ||
                        Utensils
                    return (
                        <TabsTrigger
                            key={category.id}
                            value={category.id}
                            className="flex items-center gap-2 text-base font-medium min-h-touch data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                        >
                            <Icon className="h-5 w-5" />
                            {category.label}
                        </TabsTrigger>
                    )
                })}
            </TabsList>
        </Tabs>
    )
}
