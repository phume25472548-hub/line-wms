# Desktop QR reauthentication and idle lock — implementation specification

Status: design and partial recovery patch only. NOT production-ready. Do not deploy until backend enforcement and tests are complete.

## Security requirements
- Desktop must never accept an existing LIFF browser session as proof of a fresh QR scan.
- Server creates random one-time challenge (>= 256-bit entropy), 60-second expiry, and a separate unguessable desktop polling credential. Store only hashes in database. Limit attempts and rate-limit endpoints.
- QR points to a mobile LIFF confirmation page; mobile must authenticate via LINE ID token, verify it server-side, and verify user is active and approved. Show desktop challenge context and require explicit confirmation.
- Bind the completed challenge to one desktop session and consume atomically, preventing replay and racing approvals. Never place access tokens or session credentials in the QR URL.
- Issue short-lived opaque desktop session credential after redemption; hash at rest. All desktop API requests must validate it on the server, not merely hide the UI.
- Revoke desktop session at 60 seconds of inactivity **on the server**; client idle overlay is only UX. Update last activity only for genuine user actions, not background polling or automatic requests.
- Reset and revoke desktop sessions on explicit logout, account switch, invalid authentication, and tab closure where possible; closing a tab alone is not a security boundary.
- Mobile LIFF: show 'Sign in again' and 'Switch LINE account' recovery actions on errors. Note LINE in-app account cannot be switched programmatically; explain how to switch LINE account. No 60-second idle lock on mobile.
- Protect pending forms: do not automatically submit pending operations after reauthentication; warn about unsaved changes, and prevent API requests while locked.
- Do not log LINE ID tokens, desktop credentials, or QR challenge secrets.

## Backend work remaining
1. Add DB migration for challenges and desktop sessions, with expiration indexes, RLS enabled and no anon grants.
2. Add endpoints for challenge create, mobile confirm, desktop status/redeem, logout, and desktop session validation; handle concurrent claims transactionally.
3. Extend all API actions to require validated desktop credential for desktop sessions, without trusting a client-supplied device-type flag as authorization.
4. Build desktop QR screen, mobile confirm screen, countdown, and 60-second inactivity lock with a server-side timeout.
5. Add explicit mobile recovery UI; distinguish invalid, expired and rejected LINE ID tokens.
6. Add automated tests for replay, expired QR, simultaneous claims, pending/blocked users, stale desktop session, and desktop idle timeout; test on real Chrome/Edge and LINE iOS/Android.

## Deployment gate
No deployment until migration, function, frontend, and test suite all pass together. Existing live auth stays unchanged.
