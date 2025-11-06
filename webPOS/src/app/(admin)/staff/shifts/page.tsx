'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Calendar from '@/components/calendar/Calendar'
import Button from '@/components/ui/button/Button'
import { ensureUsersLocalFirst, listUsersLocal } from '@/lib/local-users'

type ShiftAssignment = {
    start?: string | null // HH:MM (24h)
    end?: string | null // HH:MM (24h)
    notes?: string | null
}

type AssignmentMap = Record<string, Record<string, ShiftAssignment>>

const LS_KEY = 'staffShifts'

type User = { id: string; name: string; role?: string | null }
// Known demo users; extend or replace with a list from backend when available
const KNOWN_PINS = ['0000', '1111']
const USER_COLOR_PALETTE = [
    '#ef4444', // red-500
    '#f59e0b', // amber-500
    '#10b981', // emerald-500
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
]

function toDateKey(d: Date | undefined): string | null {
    if (!d) return null
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function loadAssignments(): AssignmentMap {
    if (typeof window === 'undefined') return {}
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function saveAssignments(map: AssignmentMap) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(map))
    } catch {}
}

export default function StaffShiftsPage() {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(
        new Date()
    )
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [assignments, setAssignments] = useState<AssignmentMap>(() =>
        loadAssignments()
    )
    const [startTime, setStartTime] = useState<string>('')
    const [endTime, setEndTime] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [users, setUsers] = useState<User[]>([])

    // Local-first users: show Dexie immediately, then background refresh from remote for known pins
    useEffect(() => {
        let alive = true
        ;(async () => {
            const local = await listUsersLocal()
            if (alive) setUsers(local)
            await ensureUsersLocalFirst(KNOWN_PINS)
            if (alive) setUsers(await listUsersLocal())
        })()
        return () => {
            alive = false
        }
    }, [])

    // React to external user updates (profile save, users page)
    useEffect(() => {
        const onUsersUpdated = async () => {
            const local = await listUsersLocal()
            setUsers(local)
        }
        window.addEventListener('users:updated', onUsersUpdated)
        return () => window.removeEventListener('users:updated', onUsersUpdated)
    }, [])

    const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate])

    useEffect(() => {
        if (!dateKey || !selectedUserId) return
        const existing = assignments[dateKey]?.[selectedUserId] || null
        const schedule =
            typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (cb: () => void) => Promise.resolve().then(cb)
        schedule(() => {
            setStartTime(existing?.start || '')
            setEndTime(existing?.end || '')
            setNotes(existing?.notes || '')
        })
    }, [assignments, dateKey, selectedUserId])

    const assignedForDate = useMemo(() => {
        if (!dateKey) return {}
        return assignments[dateKey] || {}
    }, [assignments, dateKey])

    const colorForUser = useCallback(
        (uid: string) => {
            const idx = Math.max(
                0,
                users.findIndex((u) => u.id === uid)
            )
            return USER_COLOR_PALETTE[idx % USER_COLOR_PALETTE.length]
        },
        [users]
    )
    const markersByDate = useMemo(() => {
        const out: Record<string, { color: string; title?: string }[]> = {}
        for (const [k, byUser] of Object.entries(assignments)) {
            const entries: { color: string; title?: string }[] = []
            for (const uid of Object.keys(byUser || {})) {
                const user = users.find((u) => u.id === uid)
                entries.push({
                    color: colorForUser(uid),
                    title: user?.name || uid,
                })
            }
            if (entries.length > 0) out[k] = entries
        }
        return out
    }, [assignments, colorForUser, users])

    const handleSave = () => {
        if (!dateKey || !selectedUserId) return
        const next: AssignmentMap = { ...assignments }
        if (!next[dateKey]) next[dateKey] = {}
        next[dateKey][selectedUserId] = {
            start: startTime || null,
            end: endTime || null,
            notes: notes || null,
        }
        setAssignments(next)
        saveAssignments(next)
    }

    const handleClear = () => {
        if (!dateKey || !selectedUserId) return
        const next: AssignmentMap = { ...assignments }
        if (next[dateKey]) {
            delete next[dateKey][selectedUserId]
            if (Object.keys(next[dateKey]).length === 0) delete next[dateKey]
        }
        setAssignments(next)
        saveAssignments(next)
        setStartTime('')
        setEndTime('')
        setNotes('')
    }

    return (
        <div className="py-4 sm:py-6">
            <div className="mb-4">
                <h1 className="text-lg font-semibold">Staff Shifts</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pick a date, choose a user, and assign their shift for the
                    day.
                </p>
            </div>

            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-6">
                    <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
                        <Calendar
                            mode="date-picker"
                            selectedDate={selectedDate ?? null}
                            onSelectDate={(d) => setSelectedDate(d)}
                            markersByDate={markersByDate}
                        />
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-6">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-3">
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                                {dateKey
                                    ? `Selected: ${dateKey}`
                                    : 'Select a date'}
                            </div>
                        </div>

                        {/* Legend */}
                        {users.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-3">
                                {users.map((u) => (
                                    <div
                                        key={`legend-${u.id}`}
                                        className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300"
                                    >
                                        <span
                                            className="inline-block h-2.5 w-2.5 rounded-full"
                                            style={{
                                                backgroundColor: colorForUser(
                                                    u.id
                                                ),
                                            }}
                                        ></span>
                                        <span className="font-medium">
                                            {u.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div>
                            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                Users
                            </h2>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {users.map((u) => {
                                    const current = assignedForDate[u.id]
                                    const isActive = selectedUserId === u.id
                                    return (
                                        <button
                                            key={u.id}
                                            className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                                                isActive
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                                            }`}
                                            onClick={() =>
                                                setSelectedUserId(u.id)
                                            }
                                        >
                                            <div className="font-medium flex items-center gap-2">
                                                <span
                                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            colorForUser(u.id),
                                                    }}
                                                    aria-hidden
                                                ></span>
                                                <span>{u.name}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {current?.start || current?.end
                                                    ? `${current.start ?? '--'} → ${current.end ?? '--'}`
                                                    : 'No shift assigned'}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                Assignment
                            </h3>
                            {!selectedUserId || !dateKey ? (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    Select a date and a user.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                                Start (HH:MM)
                                            </label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) =>
                                                    setStartTime(e.target.value)
                                                }
                                                className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-sm focus:border-brand-300 focus:outline-hidden focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                                End (HH:MM)
                                            </label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) =>
                                                    setEndTime(e.target.value)
                                                }
                                                className="h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-sm focus:border-brand-300 focus:outline-hidden focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                            Notes (optional)
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) =>
                                                setNotes(e.target.value)
                                            }
                                            rows={3}
                                            className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand-300 focus:outline-hidden focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                        />
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Button
                                            variant="outline"
                                            onClick={handleClear}
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={handleSave}
                                        >
                                            Save Assignment
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
