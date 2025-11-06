import type { AuthAction } from '@auth/core/types'

declare module '@auth/core/types' {
    export interface RequestInternal {
        url: URL
        method: 'GET' | 'POST'
        cookies?: Partial<Record<string, string>>
        headers?: Record<string, unknown>
        query?: Record<string, unknown>
        body?: Record<string, unknown>
        action: AuthAction
        providerId?: string
        error?: string
    }
}

declare module '@auth/core/types.js' {
    export * from '@auth/core/types'
}

declare module '../types.js' {
    export * from '@auth/core/types'
}

declare module '../../types.js' {
    export * from '@auth/core/types'
}

declare module '../../../types.js' {
    export * from '@auth/core/types'
}

declare module '../../../../types.js' {
    export * from '@auth/core/types'
}
