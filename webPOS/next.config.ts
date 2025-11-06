import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    allowedDevOrigins: [
        '192.168.100.242',
        'local-origin.dev',
        'simplesite.space',
        '*.local-origin.dev',
        '986d82df0159.ngrok-free.app',
        'factual-gecko-viable.ngrok-free.app',
    ],
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
    turbopack: {
        rules: {
            '*.svg': {
                loaders: [
                    {
                        loader: '@svgr/webpack',
                        options: {
                            icon: true,
                            titleProp: true,
                        },
                    },
                ],
                as: '*.js',
            },
        },
    },
    webpack(config: { module: { rules: { test: RegExp; use: string[] }[] } }) {
        config.module.rules.push({
            test: /\.svg$/,
            use: ['@svgr/webpack'],
        })

        return config
    },
    
}

export default nextConfig
