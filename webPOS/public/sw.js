self.addEventListener('install', (event) => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
    if (!event.data) return
    let payload = {}
    try {
        payload = event.data.json()
    } catch (error) {
        try {
            payload = JSON.parse(event.data.text())
        } catch {
            payload = {}
        }
    }
    const title = payload.title || 'Bynd POS'
    const options = {
        body: payload.body || '',
        data: payload.data || {},
        badge: '/favicon.ico',
        icon: '/favicon.ico',
        tag: payload.data?.requestId || undefined,
        renotify: true,
        requireInteraction: true,
    }
    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, options),
            self.clients
                .matchAll({ type: 'window', includeUncontrolled: true })
                .then((clients) => {
                    for (const client of clients) {
                        client.postMessage({
                            type: payload.data?.type || 'notification',
                            payload,
                        })
                    }
                }),
        ])
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const targetUrl = event.notification.data?.url || '/'
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if ('focus' in client) {
                        const clientUrl = new URL(client.url)
                        const target = new URL(targetUrl, clientUrl.origin)
                        if (clientUrl.origin === target.origin) {
                            client.focus()
                            if (
                                'navigate' in client &&
                                clientUrl.pathname !== target.pathname
                            ) {
                                return client.navigate(target.href)
                            }
                            return
                        }
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl)
                }
            })
    )
})
