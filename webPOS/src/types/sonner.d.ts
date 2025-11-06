declare module 'sonner' {
    import * as React from 'react'
    type ToastOptions = Record<string, unknown>
    type ToastHandler = (message: React.ReactNode, opts?: ToastOptions) => void

    export interface ToasterProps {
        theme?: 'light' | 'dark' | 'system'
        className?: string
        toastOptions?: {
            classNames?: Partial<Record<string, string>>
        }
        [key: string]: unknown
    }
    export const Toaster: React.FC<ToasterProps>
    export type ToastApi = ToastHandler & {
        success: ToastHandler
        error: ToastHandler
        info: ToastHandler
        warning: ToastHandler
    }
    export const toast: ToastApi
}
