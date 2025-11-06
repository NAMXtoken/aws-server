import { Button } from '@/components/uiz/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/uiz/dialog'
import { Input } from '@/components/uiz/input'
import { Label } from '@/components/uiz/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/uiz/select'
import { Textarea } from '@/components/uiz/textarea'
import { Category, MenuItem } from './types/pos'
import { Plus, Upload } from 'lucide-react'
import { useState } from 'react'

interface AddItemDialogProps {
    categories: Category[]
    activeCategory: string
    onAddItem: (item: MenuItem) => void
}

export function AddItemDialog({
    categories,
    activeCategory,
    onAddItem,
}: AddItemDialogProps) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [category, setCategory] = useState(activeCategory)
    const [image, setImage] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || !description.trim() || !price || !category) return

        const newItem: MenuItem = {
            id: `${category}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            name,
            description,
            price: parseFloat(price),
            image: image || '/placeholder.svg',
            category,
        }

        onAddItem(newItem)
        setName('')
        setDescription('')
        setPrice('')
        setImage('')
        setOpen(false)
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Simulate image upload - in real app this would upload to storage
            const mockUrl = URL.createObjectURL(file)
            setImage(mockUrl)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Item
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add New Item</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="item-name">Item Name</Label>
                        <Input
                            id="item-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Chocolate Ice Cream"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="item-description">Description</Label>
                        <Textarea
                            id="item-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe your item..."
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="item-price">Price</Label>
                        <Input
                            id="item-price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0.00"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="item-category">Category</Label>
                        <Select
                            value={category}
                            onValueChange={setCategory}
                            required
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="item-image">Image (optional)</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="item-image"
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                            <Button
                                type="button"
                                onClick={() =>
                                    document
                                        .getElementById('item-image')
                                        ?.click()
                                }
                                className="gap-2"
                            >
                                <Upload className="h-4 w-4" />
                                Upload Image
                            </Button>
                            {image && (
                                <span className="text-sm text-muted-foreground">
                                    Image selected
                                </span>
                            )}
                        </div>
                    </div>

                    <Button type="submit" className="w-full">
                        Add Item
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
