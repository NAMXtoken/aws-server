import LockScreen from '@/components/views/LockScreen'
import { Suspense } from 'react'

export default function LockPage() {
    return (
        <Suspense fallback={null}>
            <LockScreen />
        </Suspense>
    )
}
