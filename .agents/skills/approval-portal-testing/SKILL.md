---
name: approval-portal-new-local-smoke
description: How to start and smoke-test the approval-portal-new Next.js 16.3.x app locally without real Google/Firebase credentials.
---

# Approval Portal (new checkout) local smoke testing

## Quick start

1. `cd /home/ubuntu/repos/approval-portal-new`
2. Ensure `node --version` is v20+ (the installed Node v20.18.1 produces an `EBADENGINE` warning from `eslint-visitor-keys@5.x`, but install/build still work).
3. Run `npm install`.
4. Copy `.env.production` to `.env.local` if `.env.local` does not exist; the public Firebase config there is enough to start the dev server.
5. Run `npm run dev` and wait for the `Ready` message on `http://localhost:3000`.
6. Open Chrome and browse to `http://localhost:3000`.

## What you can test without real credentials

- `/login` — must show `ポータルにログイン`, `社内承認・回覧管理システム`, and a `Googleアカウントで続行` button.
- `/` — unauthenticated users are redirected to `/login` by `app/page.tsx`.
- `/dashboard` — unauthenticated users are redirected to `/login` by the `useAuth` guard in `app/dashboard/page.tsx`.
- `/create` — renders the full form, but Firebase `users` queries are denied. Mode switching (`稟議申請` / `回覧報告`) and the `書類種別` dropdown should still work.
- `/admin/users` — returns `null` when `!user`, so the admin UI is blocked until login.
- `/application/[id]` (e.g. `/application/test-123`) — fetches the application from Firestore; without auth it catches the permission error and renders `申請が見つかりません`.
- `/expenses` — renders the expense list UI; `useEffect` returns early when `!user`, so it shows the filter bar and a loading/empty state without crashing.

## Theme toggle verification

- A fixed `ThemeToggle` button appears at the top-right (Sun icon in dark mode, Moon icon in light mode).
- Clicking it should toggle the `light` class on `<html>`, switch the page background/card/input colors, and update the icon.
- Verify with `document.documentElement.className` or by inspecting the `aria-label` (`ライトモードに切り替え` in dark, `ダークモードに切り替え` in light).
- Test on `/login`, `/create`, and `/application/[id]`. `localStorage.theme` persists the chosen mode across reloads.

## API smoke testing without credentials

- `/api/appsheet-proxy?action=read` — without `APPS_SCRIPT_WEB_APP_URL` / `APPS_SCRIPT_API_KEY` it returns a controlled JSON 500 config error. If `.env.local` happens to contain a non-empty URL/key, it may instead return a GAS-side JSON error; the server must remain responsive either way.
- `/api/send-email` — a POST with an empty body returns 400 `Missing required fields`; a POST with `to` and `subject` but no `GMAIL_*` env returns a controlled JSON 500 `Failed to send email`. The server must remain responsive.

## Known dev-mode behavior under Next.js 16.3.x

- `console.error` calls (including the handled Firebase permission errors from `/create`, `/admin/users`, `/application/[id]`, and `/expenses`) are surfaced by the new Next.js dev indicator as a red `N Issue` badge and a light issue panel. This is a development overlay, not a production error overlay.
- The issue panel can be opened by clicking the bottom-left badge; it shows the original error message (e.g. `FirebaseError: Missing or insufficient permissions.`).

## Static checks to run

- `npm audit --audit-level=high`
- `npx tsc --noEmit`
- `npm run lint` (warnings are expected; zero errors is the pass condition)
- `npm run build`

## Devin Secrets Needed for full end-to-end testing

- `NEXT_PUBLIC_FIREBASE_*` (already in `.env.production` / `.env.local`).
- `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_API_KEY` for the `/api/appsheet-proxy` route.
- `GMAIL_USER` and `GMAIL_APP_PASSWORD` for the `/api/send-email` route.
- A real Google account registered in the Firebase `users` collection to log in via `signInWithGoogle`.
