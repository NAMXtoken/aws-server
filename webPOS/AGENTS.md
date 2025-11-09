# AGENTS OPERATIONS MANUAL

This guide trains future Agents to craft production-grade admin experiences with React 19, Next.js 15, Tailwind CSS 4, and TypeScript 5. Treat it as doctrine: follow every section unless there is a written architectural exception. Use the 'nextjs-admin' directory found at ../nextjs-admin as an exmample of the perfect resource material and finished example. Any future projects that you work on should be refactored with the knowledge you are about to recieve.

---

## 1. MINDSET & RESPONSIBILITY
- **Pixel precision first**: every component must reconcile perfectly with the approved design (Figma or QA reference). Use design tokens, inspect computed styles, and compare breakpoints before merging.
- **Accessibility is non-negotiable**: semantic HTML, keyboard flows, focus management, contrast, and aria support must be validated during development.
- **Security & resilience**: prefer server-side execution, sanitize inputs, handle failures visibly, and reject silent errors.
- **Documentation while coding**: update or add MDX/README notes when introducing new patterns; leave breadcrumbs for the next Agent.

## 2. TOOLCHAIN BASELINE
- **Node**: develop against the active LTS (â‰¥ 20). Use `.nvmrc` if version drift appears.
- **Package manager**: match the project (NPM). No lockfile churnâ€”upgrade only with explicit approval.
- **IDE support**: enable TypeScript strictness, ESLint, Prettier. Install Tailwind CSS IntelliSense for class validation.
- **Scripts**: `npm run dev`, `npm run build`, `npm run lint` must succeed before handoff. Run `npm audit` on dependency upgrades.

## 3. PROJECT ARCHITECTURE
- **App Router only**: all routes live under `src/app`. Co-locate route components (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`) with supporting files.
- **React Server Components (RSC)**: default to server components. Opt-in to client components via `"use client";` only for browser-only APIs (stateful hooks, event listeners, refs).
- **Segment boundaries**: each route segment gets a dedicated folder; nest shared UI under `src/components` with domain-based sub-folders to avoid circular imports.
- **Layouts**: keep global chrome in `src/layout`. Compose segment layouts to share nav, sidebars, and metadata. Ensure streaming compatibility by avoiding blocking work in layouts.
- **Context & hooks**: store cross-cutting concerns in `src/context` and `src/hooks`. Custom hooks must provide stable signatures, input validation, and memoized return values.
- **Icons & SVG**: prefer React components under `src/icons` or SVGR pipeline. Inline SVG only when tailoring accessibility attributes.

## 4. TYPESCRIPT STANDARDS
- **Strict mode**: never suppress TypeScript errors. Extend types rather than using `any` or `unknown` without narrowing.
- **Utility types**: leverage discriminated unions, generics, and `satisfies` to keep props precise. Expose DTOs for API surfaces.
- **Module boundaries**: define public types in `index.ts` barrels when it aids discoverability; avoid deep relative imports beyond two levels.
- **Runtime safety**: validate external data with schemas (Zod or equivalent) before trusting it. Keep parsing in server components or actions.

## 5. REACT PATTERNS
- **Hook discipline**: avoid `useEffect` for simple data fetchingâ€”prefer server actions, loader data, or `use` with promises in RSC.
- **State management**: 
  - Local UI state: component-level `useState`/`useReducer`.
  - Shared view state: React Context with memoized values; wrap in provider components.
  - Async mutations: Next.js Server Actions + optimistic UI when possible.
- **Forms**: use server actions or validated client handlers. Reuse `Label`, `Input`, and shared form elements; apply `tailwind-merge` to merge class overrides safely.
- **Error boundaries**: implement `error.tsx` for route segments. Provide retry mechanics and log actionable diagnostics.
- **Progressive enhancement**: streaming + `loading.tsx` skeletons. Avoid layout shift by matching final dimensions.

## 6. TAILWIND CSS & DESIGN SYSTEM
- **Tailwind v4 usage**: rely on utility-first classes. Configure tokens via `tailwind.config.ts` to mirror design values (spacing scale, color palette, typography).
- **Class composition**: use `tailwind-merge` (see `src/components/form/Label.tsx`) to combine defaults with overrides and avoid conflicting utilities.
- **Responsive strategy**: start mobile-first; layer breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`) intentionally. Verify components at every breakpoint in responsive mode.
- **Dark mode**: maintain parity (`dark:` variants) for all critical UI. Test with system preference toggled and forced class.
- **Spacing & layout**: prefer flexbox/grid utilities; constrain content widths (`max-w-*`) for readability. Use consistent gaps matching design tokens.
- **Typography**: use `next/font` for custom fonts; set fallbacks and weights explicitly. Headings require semantic `<h*>` hierarchy and matching classes.
- **Animation & interaction**: keep transitions subtle (`duration-150`/`ease-in-out`). Use CSS variables for shared motion curves if animations repeat.

## 7. COMPONENT AUTHORING
- **Naming**: PascalCase component files; include domain in filename (e.g., `UserStatsCard.tsx`). Export a default component plus named helpers when needed.
- **Props**: alphabetize required props first, optional with `?`. Provide JSDoc summaries for complex interfaces or when usage is non-obvious.
- **Reusability**: create primitives (buttons, inputs, cards) before duplicating markup. Centralize variants (size, emphasis) using discriminated unions.
- **Story & visual testing**: when adding UI primitives, create Storybook stories or visual regression snapshots if the project integrates those tools.

## 8. DATA, API & CACHING
- **Fetching**: use `fetch` in server components with caching semantics (`{ cache: "no-store" }`, `revalidate`, `next: { tags }`). Never fetch on the client unless needed.
- **Server Actions**: place actions alongside route components (`actions.ts`). Validate inputs, handle errors gracefully, and return typed results.
- **API routes / Route Handlers**: keep handlers servo-driven from `src/app/api`. Return typed JSON with explicit status codes.
- **Caching & ISR**: tag responses to enable revalidation. Document cache dependencies and invalidation triggers.
- **Third-party APIs**: wrap external calls in service modules; isolate secrets in `.env`. Rotate keys and avoid exposing tokens to the browser.

## 9. ACCESSIBILITY & UX
- **Semantics**: prefer native elements (e.g., `<button>` over `<div role="button">`). Include `aria-*` attributes only when they add value.
- **Focus management**: ensure visible focus states in light and dark modes. Return focus after dialogs close; trap focus while open.
- **Keyboard support**: all interactive components must operate via keyboard alone. Test with `Tab`, `Shift+Tab`, `Enter`, `Space`, arrow keys.
- **Announcements**: use `aria-live` for asynchronous success/error notifications. Provide skip links for primary navigation.
- **Internationalization**: keep copy in translation-friendly structures. Format dates/numbers with `Intl`. Avoid hard-coded locale assumptions.

## 10. PERFORMANCE & OBSERVABILITY
- **Bundle health**: monitor `next build` output. If a page exceeds 200 kB gzipped, investigate dynamic imports or component splitting.
- **Images & media**: use `next/image` with proper `fill`/`sizes`. Optimize SVGs or inline only when necessary.
- **Fonts**: load via `next/font`. Avoid layout shift by preloading variable fonts and specifying `display: swap`.
- **Instrumentation**: hook into application analytics/logging systems (e.g., Next.js Instrumentation API). Report critical errors to monitoring services.
- **Testing for regressions**: run Lighthouse or Web Vitals tracking in staging. Address CLS/FID/LCP regressions before release.

## 11. QUALITY ASSURANCE
- **Linting**: `npm run lint` must pass. Do not disable ESLint rules without architectural review.
- **Formatting**: Prettier auto-format. The CI should never reformat files you touchedâ€”format before pushing.
- **Unit tests**: prefer React Testing Library + Vitest/Jest depending on project setup. Cover stateful hooks, utilities, and server actions.
- **Integration/E2E**: build Playwright tests for critical flows (auth, navigation, data mutations). Run in CI and before cutting releases.
- **Visual testing**: adopt screenshot diffs for dashboard views where pixel-perfect adherence is critical.

## 12. DELIVERY & COLLABORATION
- **Branch strategy**: use feature branches (`feature/{scope}`) off `main`. Rebase frequently to keep history linear.
- **Commits**: atomic, descriptive messages (Conventional Commits syntax preferred). Include rationale or linked tickets.
- **PR etiquette**: provide context, screenshots/GIFs, testing notes, and checklist of validations. Request design review when UI shifts.
- **Code review**: respond to feedback promptly; resolve discussions with evidence (screenshots, metrics). Never merge your own PR without peer sign-off.
- **Change logs**: update release notes when the change affects users, accessibility, performance, or dependencies.

## 13. CONTINUOUS IMPROVEMENT
- **Stay current**: track Next.js RFCs, Tailwind releases, and React 19 updates (Actions, Server Components). Prototype upgrades in feature branches.
- **Knowledge sharing**: log insights in `/docs` or this manual. Host walkthroughs for major architectural changes.
- **Design parity**: spotlight deviations early; collaborate with design to adjust tokens or components rather than forking styles ad hoc.


# 14. Instructions for Agents
- After any changes have been made in this directory, you should add a 1-line summary of the changes that you have made to the context.md file. Prepend your 1-line summary with a timestamp in "dd/mm hh:mm" format.
- You are in the 'webPOS' directory, please also read '../../aws-server/AGENTS.md' and '../../../projectPOS/AGENTS.md'.
- When an agent is given a new task/prompt, any and all changes should be carried out by the agent that received the task/prompt.
- Agents should never issue instructions on how to complete the task/prompt if the agent can complete the tasks themself, unassisted.

---

Following this manual keeps the project aligned with global best practices, ensures maintainability, and guarantees that every delivery meets the pixel-perfect standard expected of our POS platform. Deviations require documented approval from the lead architect.
