// Extend Next.js ExperimentalConfig so custom flag stays type-safe.
import 'next/dist/server/config-shared'

declare module 'next/dist/server/config-shared' {
    interface ExperimentalConfig {
        allowMiddlewareResponseBody?: boolean
    }
}
