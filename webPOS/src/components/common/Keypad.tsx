'use client'
import React from 'react'

type KeypadProps = {
    onDigit: (digit: string) => void
    className?: string
    buttonClassName?: string
    disabled?: boolean
}

export default function Keypad({
    onDigit,
    className = '',
    buttonClassName = '',
    disabled = false,
}: KeypadProps) {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] // render 0 separately

    const baseBtn =
        'h-12 rounded-xl border border-gray-200 bg-white text-lg font-medium text-gray-800 transition hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90'

    return (
        <div className={`grid grid-cols-3 gap-2 ${className}`}>
            {digits.map((d) => (
                <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    className={`${baseBtn} ${buttonClassName}`}
                    onClick={() => onDigit(d)}
                    aria-label={`Digit ${d}`}
                >
                    {d}
                </button>
            ))}
            <button
                type="button"
                disabled={disabled}
                className={`${baseBtn} col-span-3 ${buttonClassName}`}
                onClick={() => onDigit('0')}
                aria-label="Digit 0"
            >
                0
            </button>
        </div>
    )
}
