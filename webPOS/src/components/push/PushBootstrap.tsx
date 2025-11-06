'use client'

import { useEffect, useRef } from 'react'

const PUSH_ENABLED =
    (process.env.NEXT_PUBLIC_PUSH_ENABLED ?? '').trim() === '1'

const VAPID_PUBLIC_KEY =
    process.env.NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY?.trim() || ''

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return null
    }
    try {
        const existing = await navigator.serviceWorker.getRegistration('/sw.js')
        if (existing) {
            return existing
        }
        return await navigator.serviceWorker.register('/sw.js')
    } catch (error) {
        console.warn('PushBootstrap: failed to register service worker', error)
        return null
    }
}

async function ensurePermission() {
    if (typeof Notification === 'undefined') {
        return 'denied'
    }
    if (Notification.permission === 'default') {
        try {
            return await Notification.requestPermission()
        } catch (error) {
            console.warn('PushBootstrap: notification permission error', error)
            return 'denied'
        }
    }
    return Notification.permission
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
    if (!registration.pushManager) {
        return null
    }
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
        return existing
    }
    if (!VAPID_PUBLIC_KEY) {
        console.warn('PushBootstrap: missing VAPID public key')
        return null
    }
    const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    try {
        return await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey,
        })
    } catch (error) {
        console.warn('PushBootstrap: push subscribe failed', error)
        return null
    }
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

async function sendSubscription(subscription: PushSubscription) {
    try {
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel: 'web',
                subscription,
            }),
        })
    } catch (error) {
        console.warn('PushBootstrap: failed to persist subscription', error)
    }
}

export default function PushBootstrap() {
    const bootstrappedRef = useRef(false)

    useEffect(() => {
        if (!PUSH_ENABLED) return
        if (bootstrappedRef.current) return
        bootstrappedRef.current = true

        ;(async () => {
            const permission = await ensurePermission()
            if (permission !== 'granted') {
                return
            }
            const registration = await registerServiceWorker()
            if (!registration) return
            const subscription = await subscribeToPush(registration)
            if (!subscription) return
            await sendSubscription(subscription)
        })()
    }, [])

    return null
}
