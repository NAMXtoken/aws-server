import { OAuth2Client } from 'google-auth-library'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'

const PRIVATE_IPV4_RANGES = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u,
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u,
    /^192\.168\.\d{1,3}\.\d{1,3}$/u,
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/u,
]

function looksLikePrivateHostname(hostname: string) {
    if (!hostname) return false
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        return true
    }

    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        const unwrapped = hostname.slice(1, -1)
        return unwrapped === '::1'
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/u.test(hostname)) {
        return PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(hostname))
    }

    return false
}

//function resolveGoogleAuthorizationParamsServer() {
//    const envIp =
//       process.env.GOOGLE_DEVICE_IP?.trim() ||
//        process.env.NEXT_PUBLIC_GOOGLE_DEVICE_IP?.trim() ||
//        ''
//    const envName =
//        process.env.GOOGLE_DEVICE_NAME?.trim() ||
//        process.env.NEXT_PUBLIC_GOOGLE_DEVICE_NAME?.trim() ||
//        ''
//
//    if (envIp && envName) {
//        return {
//            device_ip: envIp,
//            device_name: envName,
//        }
//    }
//
//    const rawNextAuthUrl = process.env.NEXTAUTH_URL || ''
//    if (!rawNextAuthUrl) {
//        return undefined
//    }
//
//    try {
//        const url = new URL(rawNextAuthUrl)
//        const hostname = url.hostname
//        if (!looksLikePrivateHostname(hostname)) {
//           return undefined
//        }
//        const deviceIp = envIp || hostname
//        const deviceName = envName || os.hostname()
//        if (!deviceIp || !deviceName) {
//            return undefined
//        }
//        return {
//            device_ip: deviceIp,
//            device_name: deviceName,
//        }
//    } catch {
//       return undefined
//    }
//}

//const googleAuthorizationParams = resolveGoogleAuthorizationParamsServer()

const googleClientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
const oauthClient = googleClientId ? new OAuth2Client(googleClientId) : null

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            checks: ['pkce'],
            authorization: {},
        }),
        CredentialsProvider({
            id: 'mobile-google',
            name: 'Mobile Google',
            credentials: {
                idToken: { label: 'idToken', type: 'text' },
            },
            async authorize(credentials) {
                try {
                    const idToken = credentials?.idToken
                    if (!idToken || !oauthClient || !googleClientId) {
                        return null
                    }
                    const ticket = await oauthClient.verifyIdToken({
                        idToken,
                        audience: googleClientId,
                    })
                    const payload = ticket.getPayload()
                    if (!payload || !payload.sub || !payload.email) {
                        return null
                    }
                    return {
                        id: payload.sub,
                        email: payload.email,
                        name: payload.name ?? payload.email,
                        image: payload.picture ?? undefined,
                    }
                } catch (error) {
                    console.error(
                        'Failed to authorize mobile Google login',
                        error
                    )
                    return null
                }
            },
        }),
    ],
    session: { strategy: 'jwt' },
}
