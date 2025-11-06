'use client'

import { useRouter } from 'next/navigation'

import { ChevronLeftIcon } from '@/icons'

type FloatingBackButtonProps = {
    className?: string
}

export default function FloatingBackButton({
    className,
}: FloatingBackButtonProps) {
    const router = useRouter()
    const handleClick = () => {
        if (window.history.length > 1) {
            router.back()
        } else {
            router.push('/sales')
        }
    }

    // Hide the floating button when execution happens on non-mobile widths via CSS
    return (
        <button
            type="button"
            onClick={handleClick}
            className={`md:hidden fixed bottom-20 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 dark:bg-brand-400 dark:text-gray-900 ${className ?? ''}`.trim()}
        >
            <ChevronLeftIcon aria-hidden="true" className="h-5 w-5" />
        </button>
    )
}
