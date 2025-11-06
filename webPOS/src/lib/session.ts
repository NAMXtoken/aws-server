'use client'

export function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const parts = document.cookie.split(';')
    for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        if (trimmed.startsWith(name + '=')) {
            return decodeURIComponent(trimmed.slice(name.length + 1))
        }
    }
    return null
}

export function getSessionActor(): string {
    const name = readCookie('name')
    if (name && name.trim().length > 0) return name.trim()
    const email = readCookie('email')
    if (email && email.trim().length > 0) return email.trim()
    const role = readCookie('role')
    const pin = readCookie('pin')
    if (role && pin) return `${role}:${pin}`
    if (pin) return `pin:${pin}`
    if (role) return role
    return 'local-user'
}
