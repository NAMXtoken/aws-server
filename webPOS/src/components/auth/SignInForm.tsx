'use client'

import Checkbox from '@/components/form/input/Checkbox'
import Input from '@/components/form/input/InputField'
import Label from '@/components/form/Label'
import Button from '@/components/ui/button/Button'
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from '@/icons'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const CLOCK_SKEW_WARNING_MS = 10_000

function logClockSkew() {
    if (typeof window === 'undefined') return
    let cancelled = false
    ;(async () => {
        try {
            const start = Date.now()
            const response = await fetch('/api/diagnostics/time', {
                cache: 'no-store',
            })
            const end = Date.now()
            if (!response.ok) {
                console.warn(
                    '[auth] clock check failed',
                    response.status,
                    response.statusText
                )
                return
            }
            const payload = await response.json()
            if (cancelled) return
            const serverTs = Number(payload?.serverTimestamp)
            if (!Number.isFinite(serverTs)) {
                console.warn('[auth] clock check missing server timestamp')
                return
            }
            const roundTrip = end - start
            const midpoint = start + roundTrip / 2
            const skew = serverTs - midpoint
            const timeZone =
                Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
            const summary = `[auth] clock skew ${skew}ms (rtt ${roundTrip}ms, tz ${timeZone})`
            if (Math.abs(skew) > CLOCK_SKEW_WARNING_MS) {
                console.error(summary, {
                    localIso: new Date(midpoint).toISOString(),
                    serverIso: new Date(serverTs).toISOString(),
                })
            } else {
                console.info(summary)
            }
        } catch (error) {
            if (!cancelled) {
                console.warn('[auth] clock check error', error)
            }
        }
    })()
    return () => {
        cancelled = true
    }
}

export default function SignInForm() {
    const [showPassword, setShowPassword] = useState(false)
    const [isChecked, setIsChecked] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)

    useEffect(() => {
        const cleanup = logClockSkew()
        return () => {
            cleanup?.()
        }
    }, [])

    const handleGoogleSignIn = async () => {
        if (googleLoading) return

        setGoogleLoading(true)
        logClockSkew()
        try {
            await signIn('google', { callbackUrl: '/sales' })
        } catch (error) {
            console.error('Google sign-in failed', error)
        } finally {
            setGoogleLoading(false)
        }
    }

    return (
        <div className="flex flex-col flex-1 lg:w-1/2 w-full">
            <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
                <Link
                    href="/"
                    className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                    <ChevronLeftIcon />
                    Back to dashboard
                </Link>
            </div>
            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
                <div>
                    <div className="mb-5 sm:mb-8">
                        <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                            Sign In
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Enter your email and password to sign in!
                        </p>
                    </div>
                    <div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
                            <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                disabled={googleLoading}
                                aria-busy={googleLoading}
                                className="inline-flex items-center justify-center gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10"
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 20 21"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M10.0013 5.91504C11.9671 5.91504 13.4713 6.7642 14.4096 7.64837L16.6896 5.3667C14.9671 3.7767 12.7063 2.75 10.0013 2.75C5.97378 2.75 2.49878 5.02 0.939453 8.42959L3.66711 10.4742C4.39961 8.27837 6.43961 6.33 10.0013 6.33V5.91504Z"
                                        fill="#EA4335"
                                    />
                                    <path
                                        d="M18.3795 10.7916C18.3795 10.0474 18.3195 9.55157 18.1895 9.03409H10.001V11.969C10.8235 11.969 11.5793 12.3 12.1343 12.8467C12.6893 13.3933 13.0002 14.1309 13.0002 14.975C13.0002 16.5858 11.8485 17.9341 10.001 17.9341C6.18934 17.9341 3.23017 14.63 3.23017 10.5017C3.23017 9.40133 3.51934 8.35591 4.03434 7.43925L1.27684 5.36425C0.466003 6.86675 0.00100708 8.61341 0.00100708 10.5C0.00100708 16.1358 4.35101 20.25 10.001 20.25C14.6485 20.25 18.3793 16.9883 18.3793 10.7916H18.3795Z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M3.66683 10.4742C3.47933 9.9567 3.3795 9.40379 3.3795 8.82754C3.3795 8.25129 3.47366 7.70962 3.66683 7.20295L0.93933 5.15837C0.342663 6.32337 0.00183105 7.57712 0.00183105 8.82754C0.00183105 10.1242 0.296831 11.3817 0.823497 12.5184L3.66683 10.4742Z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M10.001 5.91504C11.9677 5.91504 13.4727 6.7642 14.411 7.64837L16.691 5.3667C14.9685 3.7767 12.7077 2.75 10.001 2.75C5.97432 2.75 2.49932 5.02 0.939331 8.42959L3.66684 10.4742C4.39934 8.27837 6.43934 6.33 10.001 6.33V5.91504Z"
                                        fill="#4285F4"
                                    />
                                </svg>
                                Sign in with Google
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10"
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M0 10C0 4.47778 4.47778 0 10 0C15.5222 0 20 4.47778 20 10C20 14.9917 16.6567 19.1289 12 19.8789V12.8906H14.4378L14.9 10H12V7.77778C12 7.00062 12.2704 6.38911 13.3694 6.38911H14.9996V3.84333C14.2329 3.73973 13.2424 3.67222 12.6931 3.67222C10.0149 3.67222 8.33333 5.23342 8.33333 7.83489V10H5.55556V12.8906H8.33333V19.8789C3.64333 19.0567 0 14.9444 0 10Z"
                                        fill="#1877F2"
                                    />
                                </svg>
                                Sign in with Facebook
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10"
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 20 21"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M19.989 11.1668L20.0001 11.374C20.0001 14.6564 17.6127 17.5352 14.1827 18.2306C13.9396 18.2814 13.6939 18.021 13.6939 17.7739C13.6939 17.675 13.6963 17.0823 13.6976 16.2298C13.6976 15.7475 13.548 15.4343 13.3329 15.251C15.0407 15.0602 16.1326 14.3482 16.7059 13.6131C16.7801 13.486 16.6607 13.3015 16.5034 13.3373C15.634 13.5281 14.8255 13.4114 14.1125 13.0291C13.0925 12.4946 12.3979 11.4951 12.3979 10.001C12.3979 8.47897 13.1665 7.49244 14.0609 6.98481C14.9398 6.48504 16.0114 6.60073 16.605 6.75649C16.7654 6.79855 16.9012 6.62925 16.8228 6.47978C16.2375 5.38267 15.1782 4.60736 13.8296 4.57012C13.1247 4.54895 12.6053 4.76141 12.2779 5.03455C12.1396 5.14766 11.9702 5.22721 11.7981 5.19067C10.2877 4.86711 9.18817 4.91962 8.2769 5.3334C7.04958 5.08623 6.02845 5.17921 5.15491 5.64477C4.50646 5.96191 3.9151 6.5209 3.50706 7.24797C3.08179 7.97416 2.87135 8.8547 2.84991 9.84871C2.8632 11.5357 3.44526 12.8644 4.61102 13.6963C4.87166 13.8796 4.61241 14.3136 4.30602 14.2392C3.79147 14.1067 3.40756 13.9769 2.61731 13.6001C2.14053 13.3708 1.88217 14.028 2.12345 14.4224C2.81991 15.5561 3.96718 16.5332 5.5004 17.0561C5.80483 17.1624 5.84061 17.549 5.54414 17.6814C5.05226 17.9122 4.25022 18.2055 2.5587 18.3175C2.01152 18.3538 1.60597 18.8309 1.97605 19.271C2.64076 20.0408 4.43863 20.6405 6.19781 20.6744C7.22545 20.6767 8.08901 20.5339 8.89754 20.2963C10.7174 19.7887 11.7313 19.2221 12.3438 18.7089C12.5417 18.5408 12.8219 18.6527 12.8637 18.9092C12.9756 19.6212 13.4121 20.4204 14.2751 20.9249C14.632 21.1344 15.0417 21.2419 15.4564 21.2455C16.7347 21.2577 18.2284 20.5574 19.0678 19.4341C19.8323 18.413 20.0004 17.3544 20.0064 16.891C20.0169 15.887 19.9691 15.3717 19.9691 15.3717C19.9691 14.9119 17.9889 15.171 17.6004 15.0871C17.3314 15.0285 17.2789 14.6812 17.5341 14.5987C19.6695 13.9263 19.989 11.1668 19.989 11.1668Z"
                                        fill="black"
                                    />
                                </svg>
                                Sign in with X
                            </button>
                        </div>
                        <div className="relative py-3 sm:py-5">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="p-2 text-gray-400 bg-white dark:bg-gray-900 sm:px-5 sm:py-2">
                                    Or
                                </span>
                            </div>
                        </div>
                        <form>
                            <div className="space-y-6">
                                <div>
                                    <Label>
                                        Email{' '}
                                        <span className="text-error-500">
                                            *
                                        </span>{' '}
                                    </Label>
                                    <Input
                                        placeholder="info@gmail.com"
                                        type="email"
                                    />
                                </div>
                                <div>
                                    <Label>
                                        Password{' '}
                                        <span className="text-error-500">
                                            *
                                        </span>{' '}
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type={
                                                showPassword
                                                    ? 'text'
                                                    : 'password'
                                            }
                                            placeholder="Enter your password"
                                        />
                                        <span
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                            className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                                        >
                                            {showPassword ? (
                                                <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                                            ) : (
                                                <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            checked={isChecked}
                                            onChange={setIsChecked}
                                        />
                                        <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                                            Keep me logged in
                                        </span>
                                    </div>
                                    <Link
                                        href="/reset-password"
                                        className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                                <div>
                                    <Button className="w-full" size="sm">
                                        Sign in
                                    </Button>
                                </div>
                            </div>
                        </form>

                        <div className="mt-5">
                            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                                Don&apos;t have an account?{' '}
                                <Link
                                    href="/signup"
                                    className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                                >
                                    Sign Up
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
