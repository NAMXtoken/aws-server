'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Dropdown } from '../ui/dropdown/Dropdown'
import { DropdownItem } from '../ui/dropdown/DropdownItem'
import { Modal } from '@/components/ui/modal'
import type { NotificationRow } from '@/types/db'
import {
    listMyNotifications,
    markAllMyNotificationsRead,
    clearAllNotificationsForAllUsers,
} from '@/lib/local-notifications'
import {
    getVoidRequest,
    approveVoidRequest,
    rejectVoidRequest,
} from '@/lib/local-pos'
import { readCookie } from '@/lib/session'
import { broadcastUpdate } from '@/hooks/use-realtime'

export default function NotificationDropdown() {
    const [isOpen, setIsOpen] = useState(false)
    const [notifying, setNotifying] = useState(true)
    const [items, setItems] = useState<NotificationRow[]>([])
    const [role, setRole] = useState<string | null>(null)

    const [voidOpen, setVoidOpen] = useState(false)
    const [voidLoading, setVoidLoading] = useState(false)
    const [voidError, setVoidError] = useState<string | null>(null)
    const [voidReq, setVoidReq] = useState<null | {
        id: string
        ticketId: string
        ticketName?: string | null
        itemName: string
        requestedQty: number
        requestedBy?: string | null
    }>(null)
    const [denyReason, setDenyReason] = useState('')

    function toggleDropdown() {
        setIsOpen(!isOpen)
    }

    function closeDropdown() {
        setIsOpen(false)
    }

    const refreshList = async () => {
        try {
            const rows = await listMyNotifications()
            setItems(rows)
            setNotifying(rows.some((r) => !r.read))
        } catch {
            setItems([])
            setNotifying(false)
        }
    }

    const handleClick = async () => {
        toggleDropdown()
        try {
            await markAllMyNotificationsRead()
            await refreshList()
        } catch {}
    }

    useEffect(() => {
        ;(async () => {
            await refreshList()
            try {
                const cookie = document.cookie
                    .split(';')
                    .map((c) => c.trim())
                    .find((c) => c.startsWith('role='))
                setRole(cookie ? cookie.split('=')[1] : null)
            } catch {
                setRole(null)
            }
        })()
    }, [isOpen])

    async function handleNotificationClick(n: NotificationRow) {
        try {
            const meta: any = (n as any).meta
            if (
                meta &&
                meta.type === 'void-request' &&
                meta.requestId &&
                role === 'admin'
            ) {
                setVoidError(null)
                setVoidLoading(true)
                const req = await getVoidRequest(String(meta.requestId))
                if (req) {
                    setVoidReq({
                        id: req.id,
                        ticketId: req.ticketId,
                        ticketName: req.ticketName || null,
                        itemName: req.itemName,
                        requestedQty: req.requestedQty,
                        requestedBy: (req as any).requestedBy || null,
                    })
                    setDenyReason('')
                    setVoidOpen(true)
                    return
                }
            }
        } catch (e) {
            setVoidError(String((e as any)?.message || e))
        } finally {
            setVoidLoading(false)
        }
        closeDropdown()
    }

    return (
        <div className="relative">
            <button
                className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                onClick={handleClick}
            >
                <span
                    className={`absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 ${
                        !notifying ? 'hidden' : 'flex'
                    }`}
                >
                    <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
                </span>
                <svg
                    className="fill-current"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={closeDropdown}
                className="fixed left-1/2 top-[72px] mt-0 flex h-[min(75vh,480px)] w-[min(calc(100vw-2rem),360px)] -translate-x-1/2 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:absolute sm:left-auto sm:top-auto sm:right-0 sm:mt-[17px] sm:translate-x-0 sm:w-[320px] lg:w-[361px]"
            >
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
                    <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        Notifications
                    </h5>
                    <button
                        onClick={toggleDropdown}
                        className="text-gray-500 transition dropdown-toggle dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                        <svg
                            className="fill-current"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                </div>
                <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
                    <li className="flex items-center justify-end gap-2 px-4 py-2">
                        <button
                            onClick={async () => {
                                await markAllMyNotificationsRead()
                                await refreshList()
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            Mark all read
                        </button>
                        {role === 'admin' && (
                            <button
                                onClick={async () => {
                                    await clearAllNotificationsForAllUsers()
                                    setItems([])
                                    setNotifying(false)
                                }}
                                className="text-xs text-red-600 hover:text-red-700"
                            >
                                Clear All
                            </button>
                        )}
                    </li>
                    {items.length === 0 ? (
                        <li className="p-4 text-sm text-gray-500 dark:text-gray-400">
                            No notifications
                        </li>
                    ) : (
                        items.map((n) => (
                            <li key={n.id}>
                                <DropdownItem
                                    onItemClick={() =>
                                        handleNotificationClick(n)
                                    }
                                    className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                                >
                                    <span className="block">
                                        <span className="mb-1.5 block text-sm text-gray-800 dark:text-white/90">
                                            {n.title}
                                        </span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                                            {n.body}
                                        </span>
                                    </span>
                                    <span className="ml-auto text-[10px] text-gray-400">
                                        {new Date(
                                            n.createdAt
                                        ).toLocaleTimeString()}
                                    </span>
                                </DropdownItem>
                            </li>
                        ))
                    )}
                </ul>
                <Link
                    href="/"
                    className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                    View All Notifications
                </Link>
                <Modal
                    isOpen={voidOpen}
                    onClose={() => setVoidOpen(false)}
                    className="max-w-md p-6"
                >
                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Void Request
                            </h3>
                            {voidReq ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {voidReq.requestedBy || 'User'} requested to
                                    void {voidReq.requestedQty} x{' '}
                                    {voidReq.itemName} on{' '}
                                    {voidReq.ticketName || voidReq.ticketId}.
                                </p>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Loading...
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Reason (optional for deny)
                            </label>
                            <textarea
                                className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                rows={3}
                                value={denyReason}
                                onChange={(e) => setDenyReason(e.target.value)}
                            />
                        </div>
                        {voidError ? (
                            <div className="text-xs text-red-500">
                                {voidError}
                            </div>
                        ) : null}
                        <div className="flex items-center justify-end gap-2">
                            <button
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
                                onClick={() => setVoidOpen(false)}
                            >
                                Close
                            </button>
                            <button
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-white bg-gray-900 dark:border-gray-700 dark:bg-white dark:text-gray-900 disabled:opacity-60"
                                disabled={voidLoading || !voidReq}
                                onClick={async () => {
                                    if (!voidReq) return
                                    try {
                                        setVoidLoading(true)
                                        const approverId =
                                            readCookie('pin') ||
                                            readCookie('email') ||
                                            readCookie('name') ||
                                            'local-user'
                                        await approveVoidRequest(
                                            voidReq.id,
                                            String(approverId)
                                        )
                                        try {
                                            broadcastUpdate('tickets')
                                        } catch {}
                                        setVoidOpen(false)
                                        await refreshList()
                                    } catch (e) {
                                        setVoidError(
                                            String((e as any)?.message || e)
                                        )
                                    } finally {
                                        setVoidLoading(false)
                                    }
                                }}
                            >
                                Approve
                            </button>
                            <button
                                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-white bg-red-600 dark:border-red-700 disabled:opacity-60"
                                disabled={voidLoading || !voidReq}
                                onClick={async () => {
                                    if (!voidReq) return
                                    try {
                                        setVoidLoading(true)
                                        const approverId =
                                            readCookie('pin') ||
                                            readCookie('email') ||
                                            readCookie('name') ||
                                            'local-user'
                                        await rejectVoidRequest(
                                            voidReq.id,
                                            String(approverId),
                                            denyReason
                                        )
                                        try {
                                            broadcastUpdate('tickets')
                                        } catch {}
                                        setVoidOpen(false)
                                        await refreshList()
                                    } catch (e) {
                                        setVoidError(
                                            String((e as any)?.message || e)
                                        )
                                    } finally {
                                        setVoidLoading(false)
                                    }
                                }}
                            >
                                Deny
                            </button>
                        </div>
                    </div>
                </Modal>
            </Dropdown>
        </div>
    )
}
