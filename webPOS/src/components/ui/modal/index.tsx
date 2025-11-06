'use client'
import React, { useRef, useEffect } from 'react'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    className?: string
    children: React.ReactNode
    showCloseButton?: boolean // New prop to control close button visibility
    isFullscreen?: boolean // Default to false for backwards compatibility
    ariaLabelledBy?: string // id of the heading inside the modal
    ariaDescribedBy?: string // id of the description inside the modal
    bodyClassName?: string // Additional classes for inner modal padding/layout
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    children,
    className,
    showCloseButton = true, // Default to true for backwards compatibility
    isFullscreen = false,
    ariaLabelledBy,
    ariaDescribedBy,
    bodyClassName = '',
}) => {
    const modalRef = useRef<HTMLDivElement>(null)
    const previouslyFocused = useRef<HTMLElement | null>(null)

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
        }

        return () => {
            document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen, onClose])

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
            // Save the element that had focus before opening
            previouslyFocused.current =
                (document.activeElement as HTMLElement) || null
            // Try to focus first focusable element inside, fallback to container
            setTimeout(() => {
                const container = modalRef.current
                if (!container) return
                const focusable = container.querySelector<HTMLElement>(
                    [
                        'a[href]',
                        'button:not([disabled])',
                        'textarea:not([disabled])',
                        'input:not([disabled])',
                        'select:not([disabled])',
                        '[tabindex]:not([tabindex="-1"])',
                        '[contenteditable="true"]',
                    ].join(',')
                )
                ;(focusable || container).focus({ preventScroll: true })
            }, 0)
        } else {
            document.body.style.overflow = 'unset'
            // Restore focus to the element that had it before opening
            if (
                previouslyFocused.current &&
                typeof previouslyFocused.current.focus === 'function'
            ) {
                previouslyFocused.current.focus()
            }
        }

        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [isOpen])

    // Basic focus trap within the modal content
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Tab') return
        const container = modalRef.current
        if (!container) return
        const focusable = Array.from(
            container.querySelectorAll<HTMLElement>(
                [
                    'a[href]',
                    'button:not([disabled])',
                    'textarea:not([disabled])',
                    'input:not([disabled])',
                    'select:not([disabled])',
                    '[tabindex]:not([tabindex="-1"])',
                    '[contenteditable="true"]',
                ].join(',')
            )
        ).filter((el) => el.offsetParent !== null)

        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null

        if (e.shiftKey) {
            if (active === first || !container.contains(active)) {
                e.preventDefault()
                last.focus()
            }
        } else {
            if (active === last) {
                e.preventDefault()
                first.focus()
            }
        }
    }

    if (!isOpen) return null

    const contentClasses = isFullscreen
        ? 'w-full h-full'
        : 'relative w-full min-h-[20rem] rounded-3xl bg-white dark:bg-gray-900'

    const bodyClasses =
        'flex h-full flex-col gap-5 px-6 py-7 text-left sm:px-10 sm:py-8'

    return (
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto modal z-99999">
            {!isFullscreen && (
                <div
                    className="fixed inset-0 h-full w-full bg-gray-400/50 backdrop-blur-[32px]"
                    onClick={onClose}
                ></div>
            )}
            <div
                ref={modalRef}
                className={`${contentClasses} ${className}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
            >
                {showCloseButton && (
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 z-999 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-9 sm:w-9"
                    >
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                )}
                <div className={`${bodyClasses} ${bodyClassName}`}>
                    {children}
                </div>
            </div>
        </div>
    )
}
