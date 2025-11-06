declare global {
    interface AndroidPagerBridge {
        startAlert?: () => void
        stopAlert?: () => void
    }

    interface AndroidPushBridge {
        getPushToken?: () => string | null
        refreshPushToken?: () => void
    }

    interface Window {
        AndroidPagerBridge?: AndroidPagerBridge
        AndroidPushBridge?: AndroidPushBridge
    }
}

export {}
