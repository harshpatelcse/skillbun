# Verified email signup

The canonical production origin is **https://skillbun.tech**; configure the **https://skillbun.vercel.app** entry to redirect there. Production Google authentication uses `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=skillbun.tech` and the Firebase helper proxy in `next.config.mjs`. Confirm deployed domain and OAuth settings using [Operations](OPERATIONS.md).

Email/password signup through the SkillBun interface sends a six-digit email code before creating a Firebase account. The server validates the code and creates the account with `emailVerified: true`; the client then signs in with the chosen password. Passwords are never saved in the signup challenge collection. Google keeps its existing provider-verified flow.

## Selected production policy: free-first

Use standard Firebase Authentication with the existing Vercel OTP endpoints, mail service, and verified-email access checks. Identity Platform and the optional registration blocking function are not required for this deployment. Do not upgrade the authentication plan or deploy the optional function without explicit approval of the billing implications.

This choice adds no new paid authentication service. Existing hosting, mail, database, and rate-limit services still have their own plans and quotas; a free allowance on a billing-enabled account is not a guarantee of zero charges.

## Verification and abuse controls

- Codes expire after 10 minutes, allow five incorrect guesses, and can be resent after 60 seconds. A resend replaces the previous code.
- Mailbox sending limits are five per hour and ten per day. Gmail address aliases share a rate-limit bucket, while each challenge remains bound to its exact normalized email address.
- IP sending limits are five per minute, twenty per hour, and one hundred per day.
- Verification requests are limited to thirty per hour per email, and thirty per minute, one hundred per hour, and five hundred per day per IP.
- Shared Redis or Firestore limits fail closed for signup when durable enforcement is unavailable. Signup does not use isolated process-memory limits as a production fallback.
- Origin and request-body validation precede signup processing. Human verification is required when the existing CAPTCHA integration is enabled.
- Signup requests use a pre-auth human proof. After signing in, protected quiz and AI requests require a proof bound to that exact Firebase UID; a pre-auth proof or a different user's proof is rejected. The client obtains a new verification when the account changes.
- OTP records and state changes are transactionally managed in the server-only `emailSignupChallenges` collection. Client access is denied even to a signed-in administrator. Expiration is checked by the application; Firestore cleanup timing never extends code validity.
- API authentication checks revoked/disabled sessions and requires the Firebase token's authoritative `email_verified === true` claim. Firestore's owner-access rules also require this claim. A client-writable profile field cannot grant verified status. Ordinary access also rejects accounts with a server-only deletion marker; only the authenticated erasure endpoint can resume its own pending job. See [Operations](OPERATIONS.md) for the narrow lost-response recovery and deployment requirements.
- Existing unverified password-only accounts can finish verification without deleting their profile or progress. After code verification, recovery replaces the password while the account remains unverified, revokes old sessions, then marks the email verified. Verified, federated, and disabled accounts are not changed by this recovery path.

## Production configuration and deployment

These are the required release steps for the selected policy. A Vercel application deployment alone does not deploy Firestore rules. Use the scoped Firebase command below; an unscoped `firebase deploy` also includes the optional functions configuration in `firebase.json`.

1. **Server configuration in Vercel:** set Production `APP_ORIGIN=https://skillbun.tech` and configure `SIGNUP_OTP_SECRET` with at least 32 characters of cryptographically random secret material. Without `APP_ORIGIN`, the origin guard can fall back to the individual Vercel deployment hostname and reject requests from the public domain. An explicitly configured `HUMAN_PROOF_SECRET` of at least 32 characters is also accepted as an OTP-secret fallback. The signup flow does not derive this secret from AI provider keys or use a development default. Keep either secret server-only; never prefix it with `NEXT_PUBLIC_`. Rotating the secret invalidates pending codes.
2. **Existing services:** retain the Firebase Admin project/service-account credentials and its existing Auth/Firestore permissions. Retain `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `ZOHO_SMTP_USER=noreply@skillbun.tech`, and `ZOHO_SMTP_PASS`. Verification messages use the configured system mailbox, with replies routed to `harsh@skillbun.tech`. Redis REST credentials are optional when Firestore is available; one durable rate-limit backend must be reachable. Keep the existing Turnstile credentials and enablement settings when CAPTCHA is used.
3. **Deploy the application to Vercel** so the OTP endpoints and new auth interface are available. Redeploy after environment-variable changes so the running application receives them. Confirm the canonical origin is `https://skillbun.tech`; include only owned application origins in any configured allowlist.
4. **Deploy Firestore rules:** from the repository root, run `firebase deploy --only firestore:rules --project skillbun-75d10`. This closes direct unverified access to profiles, progress, and other authenticated client data, and explicitly denies all client access to OTP records.

**Optional Firestore cleanup:** a TTL policy can use collection group `emailSignupChallenges`, field `deleteAfter`. Records carry a cleanup timestamp approximately 24 hours after their update. TTL cleanup is asynchronous and incurs document-delete usage. The repository does not configure this cloud policy; check its actual state before changing it. The application enforces code expiry without this cleanup policy.

**Do not globally disable user signup or disable the email provider.** Firebase's `client.permissions.disabledUserSignup` setting applies to creation through all public authentication methods and can prevent first-time Google signup. Disabling email auth also disables existing password login.

## Security boundary without the blocking function

Firebase's web API key is public by design. Hiding `createUserWithEmailAndPassword` in the interface cannot prevent a caller from invoking `accounts:signUp` directly. Under the selected policy, that call can still create an **unverified Firebase Auth record**. The application, API guards, and deployed Firestore rules deny that unverified identity access to protected data.

The access boundary is authoritative email verification, not proof that every account used SkillBun's custom OTP flow. An account verified through another supported Firebase verification flow can satisfy the same verified-email check. Preventing every unverified Auth record from being created is outside the selected policy.

## Optional registration blocking function

Only if stricter account-creation enforcement is explicitly approved, upgrade the project to **Firebase Authentication with Identity Platform**, review its billing terms, and deploy the included blocking function. Install its separate dependencies with `npm ci --prefix firebase-functions`, then run `firebase deploy --only functions:signup-security --project skillbun-75d10`. Confirm the Authentication/Identity Platform **before create** trigger is registered as `requireVerifiedSignup`; an active function without the registered trigger does not protect registration.

The function uses Firebase Functions v2 on Node.js 22. Its independent package and lockfile are in `firebase-functions/`; it is not part of the Vercel dependency graph. It needs no SMTP or OTP secrets and performs no network calls. Functions/Cloud Run, builds, and artifact storage have billing requirements and usage charges separate from the Auth free allowance. No cloud upgrade, billing change, function deployment, rule deployment, or production email dispatch is performed merely by applying this code change.

The hook rejects a new user with an email unless `emailVerified` is the boolean `true`. Firebase does not let public API callers set that flag. Google's verified email is allowed without an additional OTP. Server provisioning uses the privileged Admin SDK after OTP validation, which uses OAuth2 authorization and bypasses the client registration trigger; it also explicitly sets `emailVerified: true`, consistent with the hook's policy. The hook never marks an unverified email as verified.

The official Firebase blocking-functions guide documents both the Identity Platform requirement and this exact unverified-registration rejection pattern. Firebase's official Auth emulator implementation also guards its signup `BEFORE_CREATE` invocation with `reqBody.email && !ctx.security?.Oauth2`, distinguishing privileged Admin creation from public client signup.

References:

- [Firebase blocking functions, prerequisites, and unverified-registration example](https://firebase.google.com/docs/auth/extend-with-blocking-functions)
- [Identity Toolkit accounts.signUp API](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp)
- [Identity Toolkit project configuration and ClientPermissions](https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig)
- [Firebase Auth emulator signup implementation](https://github.com/firebase/firebase-tools/blob/master/src/emulator/auth/operations.ts)
- [Firestore TTL configuration](https://firebase.google.com/docs/firestore/ttl)
- [Firebase pricing and free allowances](https://firebase.google.com/pricing)
- [Cloud Functions plan and quota requirements](https://firebase.google.com/docs/functions/quotas)

## Verification and operational checks

Run `npm test` for the signup, HTTP validation, verified-email, human-proof, and distributed-rate-limit suites. These tests use service doubles and never create real accounts or send email. They cover verified/invalid token claims, revocation handling, privileged provisioning adapters, the registration hook policy, and Firestore source guardrails. Also run `npm run test:rules` for executable Firestore checks against synthetic local emulator data; setup is in [Operations](OPERATIONS.md#executable-firestore-rules-checks). Neither local suite alone establishes deployed cloud state. Current release verification and outstanding checks belong in [Current status](CURRENT_STATUS.md).

After deployment, use a controlled test mailbox to verify delivery, code expiry, resend invalidation, wrong-code exhaustion, completed signup/login, and recovery of an existing unverified password account. Confirm verified Google signup still succeeds and unverified ID tokens cannot read/write protected Firestore documents or call authenticated APIs. Direct public Firebase signup is not expected to be rejected under the selected policy. Test that rejection only if the optional hook is deliberately deployed and registered. Run these checks only against an approved test account; never email unrelated users or alter their accounts for testing.

If the optional function is ever registered, removing it requires unregistering its Authentication/Identity Platform trigger first. Leaving a registered trigger pointed at a deleted or unavailable function can block account creation. Do not unregister this protection as a routine workaround for signup errors.
