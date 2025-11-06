import PageBreadcrumb from '@/components/common/PageBreadCrumb'
import type { Metadata } from 'next'
import React from 'react'
import ExampleKeypadDemo from './ExampleKeypadDemo'

export const metadata: Metadata = {
    title: 'Example | TailAdmin - Next.js Dashboard Template',
    description: 'Example page under Dashboard',
}

export default function ExamplePage() {
    return (
        <div>
            <PageBreadcrumb pageTitle="Example" />
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
                <div className="mx-auto w-full max-w-[420px]">
                    <h3 className="mb-4 text-center font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">
                        Keypad Demo
                    </h3>
                    <ExampleKeypadDemo />
                </div>
            </div>
        </div>
    )
}
