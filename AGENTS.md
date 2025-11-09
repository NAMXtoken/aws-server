# Project Agents Overview
This workspace contains four collaborating components that together deliver the POS experience:

# Instructions for Agents
- When making any changes in any of the four directories mentioned in this AGENTS.md, you should find or create a file called 'context.md' within the directory root.
- After changes have been made in the directory, you should add a 1-line summary of the changes that you have made to the context.md file. Prepend your 1-line summary with a timestamp in "dd/mm hh:mm" format.
- Each one of the four directories mentioned in this AGENTS.md has its own AGENTS.md for directory specific guidelines.
- When an agent is given a new task/prompt, any and all changes should be carried out by the agent that received the task/prompt.
- Agents should never issue instructions on how to complete the task/prompt if the agent can complete the tasks themself, unassisted.

## WebPOS (`webPOS/`)
Modern web client that powers the point-of-sale UI. It is designed to run in browsers and will ultimately be wrapped inside mobile WebViews. WebPOS consumes the APIs exposed by the backend server and can reuse visual building blocks sourced from `webTemplate`.

## Server (`server/`)
Node-based service responsible for authentication, business logic, and data APIs. WebPOS calls these endpoints for session management and transactional workflows. AndroidPOS relies on the same APIs indirectly through its embedded WebPOS instance. Whenever server contracts change, update the shared types/assets exposed to WebPOS to avoid regressions.

## AndroidPOS (`androidPOS/`)
Native Android shell that hosts WebPOS inside a WebView. It handles device integration concerns (app lifecycle, hardware access, offline support, secure storage) that are not available to the pure web layer. Keep AndroidPOS and WebPOS release versions aligned to ensure the embedded bundle matches server expectations.

## WebTemplate (`webTemplate/`)
Reference library of UI components, templates, and utility snippets used to accelerate WebPOS development. Treat it as a style and pattern guide: import components as needed, and mirror fixes from WebPOS back here so the catalog stays current.

---

### Relationships at a Glance
- WebPOS is the single source of truth for client UX and communicates with Server via HTTP/WebSocket APIs.
- AndroidPOS embeds WebPOS, adding native capabilities while sharing the same backend integration.
- WebTemplate feeds reusable UI pieces and patterns into WebPOS; updates here should be reflected in WebPOS imports.
- Server provides the backend contract that both WebPOS (directly) and AndroidPOS (indirectly) depend on.

### Collaboration Tips
- Align API versions: document breaking server changes and coordinate WebPOS/AndroidPOS updates.
- Share component libraries: when WebPOS introduces reusable UI, consider upstreaming to WebTemplate for future reuse.
- Test end-to-end flows: validate critical POS scenarios both in a browser (WebPOS <-> Server) and on device (AndroidPOS <-> WebPOS <-> Server) to catch integration issues early.

## Server/WebPOS Environment Expectations
- `server/.env.local` is the canonical source for backend runtime URLs. Keep `AUTH_BACKEND_URL` pointing at `https://bynd-pos.vercel.app/api`, but ensure all public-facing fields (`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_SIGNIN_URL`, `NEXT_PUBLIC_CLOCK_BASE_URL`, `NEXT_PUBLIC_GOOGLE_LOGIN_URI`) reference `https://simplesite.space`, since that is where end users start the OAuth flow.
- `webPOS/.env.local` mirrors the same split: UI URLs (`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, etc.) stay on `https://simplesite.space` while any `*_BACKEND_*` value targets `https://bynd-pos.vercel.app`. When changing hosts, update both files together.
- Both subprojects must use the `web-app-client-id`/secret from `.variables`. If those values rotate, update `server/.env.local`, `webPOS/.env.local`, and `androidPOS/app/src/main/res/values/strings.xml` in the same change to avoid another six-hour chase.

## Push Notification Architecture (2025-11-01)
- Web clients: `webPOS` ships `public/sw.js` and VAPID endpoints; keys live in `webPOS/.env` (`PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`).
- Backend: `/api/push/subscribe` registers both web push and FCM channels via Apps Script (`code.gs` PushSubscriptions sheet). `/api/push/void/route.ts` delivers through Web Push (`web-push`) and Firebase Cloud Messaging; authenticate either with the legacy server key (`FCM_SERVER_KEY`) or an HTTP v1 service account (`FCM_SERVICE_ACCOUNT`).
- Android app: `androidPOS` adds an FCM token store, `FirebaseMessagingService`, and `AndroidPushBridge` so the embedded WebView can fetch native tokens and register them through `/api/push/subscribe`.
