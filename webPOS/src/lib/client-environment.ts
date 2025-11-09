export type ClientEnvironment = 'android-shell' | 'browser'

const ANDROID_SHELL_MARKER = 'ByndPOSAndroid/'

export function detectClientEnvironment(userAgent: string | null | undefined): ClientEnvironment {
    if (userAgent && userAgent.includes(ANDROID_SHELL_MARKER)) {
        return 'android-shell'
    }
    return 'browser'
}

export function isAndroidShell(userAgent: string | null | undefined): boolean {
    return detectClientEnvironment(userAgent) === 'android-shell'
}
