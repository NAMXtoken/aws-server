'use client'
import React from 'react'
import Keypad from '@/components/common/Keypad'

export default function ExampleKeypadDemo() {
    const [value, setValue] = React.useState('')

    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Value
            </label>
            <input
                type="text"
                value={value}
                readOnly
                className="mb-5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-800 focus:outline-none dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
            />

            <Keypad onDigit={(d) => setValue((prev) => prev + d)} />
        </div>
    )
}
