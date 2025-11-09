'use client'

import Script from 'next/script'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CLIENT_ID =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
    '664238525083-3vem9gjdis5fgchljubhfi74i7835be2.apps.googleusercontent.com'
const PRESET_LOGIN_URI = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_URI ?? undefined

type GoogleIdConfig = {
    client_id: string
    context?: 'signin' | 'signup'
    ux_mode?: 'popup' | 'redirect'
    login_uri?: string
    auto_select?: boolean
    itp_support?: boolean
}

type GoogleButtonConfig = {
    type?: 'standard' | 'icon'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signup_with'
    size?: 'large' | 'medium' | 'small'
    logo_alignment?: 'left' | 'center'
}

type GoogleAccounts = {
    id?: {
        initialize: (config: GoogleIdConfig) => void
        renderButton: (parent: HTMLElement, options: GoogleButtonConfig) => void
    }
}

type GoogleRuntime = typeof globalThis & {
    google?: {
        accounts?: GoogleAccounts
    }
    location?: {
        origin?: string
    }
}

declare global {
    interface Window {
        google?: {
            accounts?: GoogleAccounts
        }
    }
}

export default function SignInPage() {
    const buttonRef = useRef<HTMLDivElement>(null)
    const scriptState = useState(false)
    const scriptReady = scriptState[0]
    const setScriptReady = scriptState[1]

    const loginUri = useMemo(() => {
        if (PRESET_LOGIN_URI) {
            return PRESET_LOGIN_URI
        }

        const runtime = globalThis as GoogleRuntime
        const origin = runtime.location?.origin
        if (origin) {
            return `${origin}/signin`
        }

        return undefined
    }, [])

    const renderButton = useCallback(() => {
        const runtime = globalThis as GoogleRuntime
        const googleId = runtime.google?.accounts?.id
        if (!googleId || !buttonRef.current || !CLIENT_ID) {
            return
        }

        googleId.initialize({
            client_id: CLIENT_ID,
            context: 'signin',
            ux_mode: 'popup',
            login_uri: loginUri,
            auto_select: true,
            itp_support: true,
        })

        googleId.renderButton(buttonRef.current, {
            type: 'standard',
            shape: 'pill',
            theme: 'outline',
            text: 'signin_with',
            size: 'large',
            logo_alignment: 'left',
        })
    }, [loginUri])

    useEffect(() => {
        if (!scriptReady) {
            return
        }

        renderButton()
    }, [renderButton, scriptReady])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-6 dark:bg-black">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={() => setScriptReady(true)}
            />
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                Sign in with Google
            </h1>
            <div
                ref={buttonRef}
                className="flex flex-col items-center justify-center"
            />
            {!CLIENT_ID && (
                <p className="max-w-lg text-center text-sm text-red-600">
                    Missing Google client ID. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID
                    and reload.
                </p>
            )}
        </div>
    )
}
