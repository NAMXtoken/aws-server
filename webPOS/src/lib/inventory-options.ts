export interface InventoryOptionIngredient {
    name: string
    qty: number
}

export interface InventoryOptionChoice {
    id: string
    name: string
    ingredients: InventoryOptionIngredient[]
    priceDelta?: number
}

export interface InventoryOptionGroup {
    id: string
    name: string
    choices: InventoryOptionChoice[]
}

const toNumber = (value: unknown): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

const sanitizeIngredients = (value: any): InventoryOptionIngredient[] => {
    if (!Array.isArray(value)) return []
    return value
        .map((entry) => {
            const name = String(entry?.name ?? '').trim()
            if (!name) return null
            return {
                name,
                qty: toNumber(entry?.qty ?? entry?.quantity ?? 0),
            }
        })
        .filter(Boolean) as InventoryOptionIngredient[]
}

const sanitizeChoice = (value: any): InventoryOptionChoice | null => {
    const name = String(value?.name ?? '').trim()
    const id = String(value?.id ?? name).trim()
    if (!id) return null
    const rawDelta =
        value?.priceDelta ??
        value?.delta ??
        value?.price ??
        value?.upcharge ??
        value?.extra ??
        0
    return {
        id,
        name,
        ingredients: sanitizeIngredients(value?.ingredients),
        priceDelta: toNumber(rawDelta),
    }
}

const sanitizeGroup = (value: any): InventoryOptionGroup | null => {
    const name = String(value?.name ?? '').trim()
    const id = String(value?.id ?? name).trim()
    if (!id) return null
    const choicesRaw = Array.isArray(value?.choices) ? value.choices : []
    const choices = choicesRaw
        .map((choice: any) => sanitizeChoice(choice))
        .filter(Boolean) as InventoryOptionChoice[]
    return {
        id,
        name,
        choices,
    }
}

export const parseInventoryOptions = (
    input?: string | null
): InventoryOptionGroup[] => {
    if (!input) return []
    try {
        const parsed = JSON.parse(input)
        if (!Array.isArray(parsed)) return []
        return parsed
            .map((group) => sanitizeGroup(group))
            .filter(Boolean) as InventoryOptionGroup[]
    } catch {
        return []
    }
}

export const serializeInventoryOptions = (
    groups: InventoryOptionGroup[]
): string => {
    try {
        return JSON.stringify(groups)
    } catch {
        return '[]'
    }
}

export const hasOptionStructure = (groups: InventoryOptionGroup[]): boolean => {
    return groups.some((group) => group.choices.length > 0)
}

export const normalizeOptionGroups = (
    groups: InventoryOptionGroup[]
): InventoryOptionGroup[] => {
    return groups.map((group) => ({
        ...group,
        name: group.name.trim(),
        choices: group.choices.map((choice) => ({
            ...choice,
            name: choice.name.trim(),
            priceDelta: toNumber(choice.priceDelta),
            ingredients: choice.ingredients
                .map((ingredient) => ({
                    name: ingredient.name.trim(),
                    qty: toNumber(ingredient.qty),
                }))
                .filter((ingredient) => ingredient.name && ingredient.qty > 0),
        })),
    }))
}

export const validateOptionGroups = (
    groups: InventoryOptionGroup[]
): string | null => {
    if (!groups.length) return 'Add at least one option group'
    for (const group of groups) {
        const groupName = group.name.trim()
        if (!groupName) return 'Each option needs a name'
        if (group.choices.length < 2)
            return `Provide at least two choices for "${groupName}"`
        for (const choice of group.choices) {
            const choiceName = choice.name.trim()
            if (!choiceName) return 'Each choice in an option requires a name'
            if (!choice.ingredients.length)
                return `Add ingredients for "${choiceName}"`
            for (const ingredient of choice.ingredients) {
                if (!ingredient.name.trim())
                    return `Ingredient names cannot be blank in "${choiceName}"`
                if (!(ingredient.qty > 0))
                    return `Quantities must be greater than zero for "${choiceName}"`
            }
        }
    }
    return null
}
