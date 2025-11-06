import { Button } from '@/components/uiz/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/uiz/dialog'
import { Label } from '@/components/uiz/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/uiz/select'
import { Category } from './types/pos'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/uiz/input'

interface AddCategoryDialogProps {
    onAddCategory: (category: Category) => void
}

const iconOptions = [
    'Utensils',
    'Wine',
    'Clock',
    'Coffee',
    'IceCream',
    'Pizza',
    'Sandwich',
    'Cake',
]

export function AddCategoryDialog({ onAddCategory }: AddCategoryDialogProps) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [icon, setIcon] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || !icon) return

        const id = name.toLowerCase().replace(/\s+/g, '-')
        const newCategory: Category = {
            id,
            label: name,
            icon: icon,
            value: id,
        }

        onAddCategory(newCategory)
        setName('')
        setIcon('')
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Category
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New Category</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="category-name">Category Name</Label>
                        <Input
                            id="category-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Desserts, Burgers, Cocktails"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="category-icon">Icon</Label>
                        <Select value={icon} onValueChange={setIcon} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an icon" />
                            </SelectTrigger>
                            <SelectContent>
                                {iconOptions.map((iconName) => (
                                    <SelectItem key={iconName} value={iconName}>
                                        {iconName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" className="w-full">
                        Add Category
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
