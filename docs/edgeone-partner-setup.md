# Chinese partner portal: EdgeOne Pages setup

The partner view is a separate static page at `/partner.html`. It does not load LINE's LIFF SDK and never receives a LINE ID token, Google credential, or Apps Script partner key. Existing LINE WMS pages and `config.js` are unchanged.

## Important backend dependency

The repository contains the LINE WMS browser client, but not the Google Apps Script server project. The current browser API uses verified LINE ID tokens and does not include a partner-only read API. The EdgeOne adapter therefore expects the Apps Script deployment to implement a new read-only action before live data can appear:

- `action`: `partner.snapshot`
- Body: `{ "action": "partner.snapshot", "partnerKey": "<server-side key>", "payload": { "stockLimit": 1000, "orderLimit": 100 } }`
- Compare `partnerKey` against a Google Apps Script Script Property; never return or log the value. Apps Script web apps expose request body data to `doPost(e)`, so the adapter sends this server-to-server credential in the JSON body rather than relying on custom request headers.
- Success: `{ "ok": true, "data": { "stocks": [...], "orders": [...], "updatedAt": "..." } }`
- Each stock row needs `sku`, `name`, optional `category`, `unit`, `available`, `inspection`, and `total`.
- Each order row needs `orderNo`, `channelName`, `status`, `createdAt`, `quantity`, and `itemCount`.
- The handler must return only those fields, enforce the two limits, and reject all other actions for this partner credential. It must not use or accept a caller-supplied LINE user ID.

Store the partner API key as a Google Apps Script **Script Property** and as EdgeOne's `WMS_PARTNER_API_KEY` secret. Keep it separate from the existing LINE WMS API authentication. Rotate the key if it has ever been committed or shared in chat.

## EdgeOne environment values

In the Pages project's production environment, add these values as secrets/environment variables:

| Name | Value |
| --- | --- |
| `PARTNER_PASSWORD` | A unique, randomly generated partner password of at least 16 characters. Share it with partners using a private channel. |
| `PARTNER_SESSION_SECRET` | At least 32 random characters, used to sign eight-hour HttpOnly sessions. |
| `WMS_GAS_URL` | The current Google Apps Script Web App `/exec` URL. This is an endpoint, not an authentication credential. |
| `WMS_PARTNER_API_KEY` | The partner-only API key configured in Apps Script Script Properties. |

Do not add any of these values to `config.js`, HTML, JavaScript, or Git. EdgeOne Pages Functions read them server-side. Keep the partner password distinct from the Apps Script key.

## Deploy with the free EdgeOne Pages / Makers tier

1. In Tencent EdgeOne Pages, create a Pages project from `phume25472548-hub/line-wms` and select the branch that contains this change. Keep the output directory at the repository root; the existing app is plain static HTML/CSS/JS.
2. Add the four production values above in the project/function environment settings, marking the password, session secret, and partner API key as secrets.
3. Ensure the deployment includes the `functions/api/partner/` Pages Functions routes. The routes are `/api/partner/login`, `/api/partner/logout`, and `/api/partner/snapshot`.
4. Configure an EdgeOne WAF/access-control rate limit for `/api/partner/login` (for example, a small per-IP limit with a temporary block). Pages Functions do not depend on an in-memory counter for this protection.
5. Deploy and open `/partner.html`. Confirm the wrong password is rejected, successful login sets an HttpOnly Secure SameSite=Strict cookie, the snapshot is read-only, logout clears the session, and the existing LINE WMS home page still opens.
6. Share the partner URL and password privately. If using a custom domain for mainland China access, confirm the domain/ICP and EdgeOne site requirements in Tencent Cloud before binding it.

EdgeOne lists a free Pages/Makers option with Pages Functions. The live China access path still depends on the selected EdgeOne site/region and the Apps Script origin being reachable from that runtime; test the deployed page and data request from the partner's actual mainland network before relying on it operationally.

## Data exposure and session behavior

The API adapter only forwards the fixed `partner.snapshot` action and whitelists returned fields. It never exposes customer names, phone numbers, order amounts, product cost/profit, staff identities, or write operations. Sessions expire after eight hours and use `HttpOnly`, `Secure`, and `SameSite=Strict` cookies. Logout invalidates the browser cookie. The login route should also be rate-limited in EdgeOne's WAF.
