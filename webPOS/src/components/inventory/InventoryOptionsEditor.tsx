'use client'

import { useEffect, useMemo, useState } from 'react'
import { uuid } from '@/lib/db'
import type {
    InventoryOptionChoice,
    InventoryOptionGroup,
} from '@/lib/inventory-options'

type IngredientCatalogItem = {
    name: string
    packageUnits: string
    totalVolume: number
}

type DraftState = Record<string, { name: string; qty: string }>

interface InventoryOptionsEditorProps {
    enabled: boolean
    options: InventoryOptionGroup[]
    ingredientsCatalog: IngredientCatalogItem[]
    onEnabledChange: (value: boolean) => void
    onOptionsChange: (value: InventoryOptionGroup[]) => void
    onError?: (message: string | null) => void
}

const ensureDraftEntry = (drafts: DraftState, choiceId: string): DraftState => {
    if (drafts[choiceId]) return drafts
    return { ...drafts, [choiceId]: { name: '', qty: '' } }
}

const trimLower = (value: string): string => value.trim().toLowerCase()

export function InventoryOptionsEditor({
    enabled,
    options,
    ingredientsCatalog,
    onEnabledChange,
    onOptionsChange,
    onError,
}: InventoryOptionsEditorProps) {
    const [drafts, setDrafts] = useState<DraftState>({})

    useEffect(() => {
        if (!enabled) {
            setDrafts({})
            return
        }
        const choiceIds = options.flatMap((group) =>
            group.choices.map((choice) => choice.id)
        )
        setDrafts((prev) => {
            const next: DraftState = {}
            for (const id of choiceIds) {
                next[id] = prev[id] ?? { name: '', qty: '' }
            }
            return next
        })
    }, [enabled, options])

    const ingredientLookup = useMemo(() => {
        const map = new Map<string, IngredientCatalogItem>()
        for (const item of ingredientsCatalog) {
            map.set(trimLower(item.name), item)
        }
        return map
    }, [ingredientsCatalog])

    const updateOptionGroups = (
        updater: (current: InventoryOptionGroup[]) => InventoryOptionGroup[]
    ) => {
        const next = updater(options)
        onOptionsChange(next)
    }

    const clearError = () => onError?.(null)

    const addOption = () => {
        clearError()
        updateOptionGroups((current) => [
            ...current,
            { id: uuid(), name: '', choices: [] },
        ])
    }

    const removeOption = (optionId: string) => {
        clearError()
        const nextGroups = options.filter((group) => group.id !== optionId)
        onOptionsChange(nextGroups)
        setDrafts((prev) => {
            const remainingIds = new Set(
                nextGroups.flatMap((group) =>
                    group.choices.map((choice) => choice.id)
                )
            )
            const copy: DraftState = { ...prev }
            for (const choiceId of Object.keys(copy)) {
                if (!remainingIds.has(choiceId)) {
                    delete copy[choiceId]
                }
            }
            return copy
        })
    }

    const updateOptionName = (optionId: string, name: string) => {
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId ? { ...group, name } : group
            )
        )
    }

    const addChoice = (optionId: string) => {
        clearError()
        const choiceId = uuid()
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId
                    ? {
                          ...group,
                          choices: [
                              ...group.choices,
                              { id: choiceId, name: '', ingredients: [] },
                          ],
                      }
                    : group
            )
        )
        setDrafts((prev) => ensureDraftEntry(prev, choiceId))
    }

    const removeChoice = (optionId: string, choiceId: string) => {
        clearError()
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId
                    ? {
                          ...group,
                          choices: group.choices.filter(
                              (choice) => choice.id !== choiceId
                          ),
                      }
                    : group
            )
        )
        setDrafts((prev) => {
            const next = { ...prev }
            delete next[choiceId]
            return next
        })
    }

    const updateChoiceName = (
        optionId: string,
        choiceId: string,
        name: string
    ) => {
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId
                    ? {
                          ...group,
                          choices: group.choices.map((choice) =>
                              choice.id === choiceId
                                  ? { ...choice, name }
                                  : choice
                          ),
                      }
                    : group
            )
        )
    }

    const updateChoicePrice = (
        optionId: string,
        choiceId: string,
        value: string
    ) => {
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId
                    ? {
                          ...group,
                          choices: group.choices.map((choice) => {
                              if (choice.id !== choiceId) return choice
                              if (value.trim().length === 0) {
                                  return { ...choice, priceDelta: 0 }
                              }
                              const parsed = Number(value)
                              const normalized = Number.isFinite(parsed)
                                  ? parsed
                                  : 0
                              return { ...choice, priceDelta: normalized }
                          }),
                      }
                    : group
            )
        )
    }

    const removeChoiceIngredient = (
        optionId: string,
        choiceId: string,
        ingredientName: string
    ) => {
        clearError()
        updateOptionGroups((current) =>
            current.map((group) =>
                group.id === optionId
                    ? {
                          ...group,
                          choices: group.choices.map((choice) =>
                              choice.id === choiceId
                                  ? {
                                        ...choice,
                                        ingredients: choice.ingredients.filter(
                                            (ing) => ing.name !== ingredientName
                                        ),
                                    }
                                  : choice
                          ),
                      }
                    : group
            )
        )
    }

    const onDraftChange = (
        choiceId: string,
        field: 'name' | 'qty',
        value: string
    ) => {
        setDrafts((prev) => {
            const base = ensureDraftEntry(prev, choiceId)
            return {
                ...base,
                [choiceId]: {
                    ...base[choiceId],
                    [field]: value,
                },
            }
        })
    }

    const addChoiceIngredient = (choice: InventoryOptionChoice) => {
        const draft = drafts[choice.id] ?? { name: '', qty: '' }
        const selectedName = draft.name.trim()
        if (!selectedName) {
            onError?.('Please pick an ingredient for the option choice')
            return
        }
        const qtyValue = draft.qty.trim()
        if (!qtyValue) {
            onError?.('Please provide a quantity for the option choice')
            return
        }
        const qty = Number(qtyValue)
        if (!Number.isFinite(qty) || qty <= 0) {
            onError?.('Quantity must be greater than 0')
            return
        }
        const duplicate = choice.ingredients.some(
            (ing) => trimLower(ing.name) === trimLower(selectedName)
        )
        if (duplicate) {
            onError?.('Ingredient already added to this choice')
            return
        }
        clearError()
        updateOptionGroups((current) =>
            current.map((group) => ({
                ...group,
                choices: group.choices.map((currentChoice) =>
                    currentChoice.id === choice.id
                        ? {
                              ...currentChoice,
                              ingredients: [
                                  ...currentChoice.ingredients,
                                  { name: selectedName, qty },
                              ],
                          }
                        : currentChoice
                ),
            }))
        )
        setDrafts((prev) => ({
            ...prev,
            [choice.id]: { name: '', qty: '' },
        }))
    }

    return (
        <section className="space-y-3 rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Menu Options
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Offer selectable menu choices with their own ingredient
                        usage.
                    </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs">
                    <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={enabled}
                        onChange={(event) => {
                            const next = event.target.checked
                            onEnabledChange(next)
                            if (!next) {
                                onOptionsChange([])
                                clearError()
                            }
                        }}
                    />
                    <span>Enable options</span>
                </label>
            </div>
            {enabled ? (
                <div className="space-y-4">
                    {options.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Add an option group to start collecting choice
                            ingredients.
                        </p>
                    ) : null}
                    {options.map((option) => (
                        <div
                            key={option.id}
                            className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
                        >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex-1">
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                        Option name
                                    </label>
                                    <input
                                        value={option.name}
                                        onChange={(event) =>
                                            updateOptionName(
                                                option.id,
                                                event.target.value
                                            )
                                        }
                                        placeholder="e.g., Size"
                                        className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                    onClick={() => removeOption(option.id)}
                                >
                                    Remove option
                                </button>
                            </div>

                            <div className="space-y-3">
                                {option.choices.map((choice) => {
                                    const draft = drafts[choice.id] ?? {
                                        name: '',
                                        qty: '',
                                    }
                                    const selectedIngredient =
                                        ingredientLookup.get(
                                            trimLower(draft.name || '')
                                        )
                                    return (
                                        <div
                                            key={choice.id}
                                            className="space-y-3 rounded border border-gray-200 p-3 dark:border-gray-800"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                                                    <div className="flex-1">
                                                        <label className="mb-1 block text-xs text-muted-foreground">
                                                            Choice name
                                                        </label>
                                                        <input
                                                            value={choice.name}
                                                            onChange={(event) =>
                                                                updateChoiceName(
                                                                    option.id,
                                                                    choice.id,
                                                                    event.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="e.g., Full pint"
                                                            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                        />
                                                    </div>
                                                    <div className="sm:w-40">
                                                        <label className="mb-1 block text-xs text-muted-foreground">
                                                            Price adjustment
                                                            (optional)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={
                                                                Number.isFinite(
                                                                    choice.priceDelta
                                                                )
                                                                    ? choice.priceDelta
                                                                    : 0
                                                            }
                                                            onChange={(event) =>
                                                                updateChoicePrice(
                                                                    option.id,
                                                                    choice.id,
                                                                    event.target
                                                                        .value
                                                                )
                                                            }
                                                            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                                    onClick={() =>
                                                        removeChoice(
                                                            option.id,
                                                            choice.id
                                                        )
                                                    }
                                                >
                                                    Remove choice
                                                </button>
                                            </div>

                                            <div className="space-y-2 border-t border-dashed border-gray-200 pt-3 dark:border-gray-800">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                                    <div className="flex-1">
                                                        <label className="mb-1 block text-xs text-muted-foreground">
                                                            Ingredient
                                                        </label>
                                                        <select
                                                            value={draft.name}
                                                            onChange={(event) =>
                                                                onDraftChange(
                                                                    choice.id,
                                                                    'name',
                                                                    event.target
                                                                        .value
                                                                )
                                                            }
                                                            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                        >
                                                            <option value="">
                                                                Select
                                                                ingredient...
                                                            </option>
                                                            {ingredientsCatalog.map(
                                                                (ing) => (
                                                                    <option
                                                                        key={
                                                                            ing.name
                                                                        }
                                                                        value={
                                                                            ing.name
                                                                        }
                                                                    >
                                                                        {
                                                                            ing.name
                                                                        }
                                                                    </option>
                                                                )
                                                            )}
                                                        </select>
                                                    </div>
                                                    <div className="w-full sm:w-28">
                                                        <label className="mb-1 block text-xs text-muted-foreground">
                                                            Qty
                                                        </label>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={draft.qty}
                                                            onChange={(event) =>
                                                                onDraftChange(
                                                                    choice.id,
                                                                    'qty',
                                                                    event.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="0"
                                                            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                        />
                                                    </div>
                                                    <div className="min-w-[96px] text-xs text-gray-600 dark:text-gray-400">
                                                        {draft.name
                                                            ? (selectedIngredient?.packageUnits ??
                                                              '')
                                                            : ''}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-gray-300 bg-gray-900 px-3 py-2 text-xs text-white dark:border-gray-700 dark:bg-white dark:text-gray-900"
                                                        onClick={() =>
                                                            addChoiceIngredient(
                                                                choice
                                                            )
                                                        }
                                                    >
                                                        Add
                                                    </button>
                                                </div>

                                                {choice.ingredients.length >
                                                0 ? (
                                                    <div className="rounded-md border border-gray-200 dark:border-gray-800">
                                                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                                            {choice.ingredients.map(
                                                                (
                                                                    ingredient
                                                                ) => {
                                                                    const meta =
                                                                        ingredientLookup.get(
                                                                            trimLower(
                                                                                ingredient.name
                                                                            )
                                                                        )
                                                                    return (
                                                                        <div
                                                                            key={
                                                                                ingredient.name
                                                                            }
                                                                            className="flex items-center justify-between p-2 text-sm"
                                                                        >
                                                                            <span className="text-gray-900 dark:text-gray-100">
                                                                                {
                                                                                    ingredient.name
                                                                                }
                                                                            </span>
                                                                            <div className="flex items-center gap-3">
                                                                                <span className="text-gray-600 dark:text-gray-400">
                                                                                    {
                                                                                        ingredient.qty
                                                                                    }{' '}
                                                                                    {meta?.packageUnits ??
                                                                                        ''}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                                                                    onClick={() =>
                                                                                        removeChoiceIngredient(
                                                                                            option.id,
                                                                                            choice.id,
                                                                                            ingredient.name
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Remove
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                }
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="rounded-md border border-dashed border-gray-200 p-2 text-xs text-muted-foreground dark:border-gray-800">
                                                        No ingredients added yet
                                                        for this choice.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                <button
                                    type="button"
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700"
                                    onClick={() => addChoice(option.id)}
                                >
                                    + Add choice
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700"
                        onClick={addOption}
                    >
                        + Add option
                    </button>
                </div>
            ) : null}
        </section>
    )
}
