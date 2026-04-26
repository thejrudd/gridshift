# Authentication And Memberships

Back: [[Home]]

This note captures how GridShift could add authentication, host-controlled memberships, and a future commercial / royalty model without abandoning self-hosting.

## Goals

- let hosts control who can sign in
- support optional paid memberships to cover hosting and API costs
- keep the project open source and self-hostable
- leave room for the project owner to benefit if others commercially host it

## Product Direction

There are really two separate problems here:

1. **Authentication / access control**
2. **Licensing / monetization rights**

They should be designed together, but not confused with each other.

## Authentication Model Options

### Option 1 — Self-Hosted Auth Adapter

Hosts run GridShift with one of a few supported auth providers:

- email magic link
- Google / GitHub OAuth
- password login
- invite-only accounts

Best fit if the goal is flexibility for self-hosters.

### Option 2 — Hosted “Official” Auth Service

GridShift ships an official hosted auth + billing backend, while self-hosters can still disable it and run local auth.

Best fit if there is eventually an official hosted product.

### Option 3 — Reverse Proxy / Header-Based Auth

Allow advanced hosts to put the app behind:

- Authentik
- Keycloak
- Cloudflare Access
- Tailscale / internal SSO

Best fit for technical self-hosters and leagues that want private access only.

## Membership / Billing Model

Useful model for hosts:

- free local/self-host mode
- optional membership mode
- hosts define plans and limits

Possible membership gates:

- live features powered by paid APIs
- league count or sync frequency
- advanced Trade / Draft Coach tools
- historical exports / premium reports

That keeps the core app open while letting hosts recover real operating costs.

## Recommended Technical Shape

### App Layers

- **Frontend** — current React/PWA app
- **Backend API** — auth, membership checks, secure API proxying
- **Billing layer** — optional Stripe or equivalent
- **Entitlements layer** — feature flags by membership tier

### Minimal first implementation

1. Add invite-only auth
2. Add host-managed users / roles
3. Add a simple `isMember` or tier entitlement model
4. Put expensive APIs behind the backend

That solves access control before trying to solve full SaaS billing.

## Licensing / Royalty Reality

If you want other people to charge money for hosted access **and** you want royalties, that usually requires more than a standard open-source license.

Important plain-English point:

- **AGPL** can force source disclosure for networked modifications, but it does **not** create automatic royalty payments
- “source available” licenses can restrict commercial hosting more directly, but may stop being open source in the OSI sense
- if royalties are the goal, the strongest model is usually **dual licensing** or a separate **commercial-hosting license**

## Practical Licensing Paths

### Path A — AGPL + Trademark Control

- code under AGPL
- official project name / branding protected by trademark
- others can self-host, but commercial hosts cannot market themselves as the official product without permission

Good for openness, weak for direct royalties.

### Path B — Dual License

- community/self-host version under open-source license
- paid commercial-hosting license required for organizations charging end users

Best fit if royalties matter.

### Path C — Source-Available Commercial Restriction

- code is visible
- commercial hosting requires explicit permission/license

Stronger business control, weaker open-source purity.

## Recommendation

Best product/technical sequence:

1. build access control first
2. add backend-proxied premium API integrations second
3. add optional membership billing third
4. decide licensing model before encouraging third-party paid hosting

Best licensing direction if royalties are important:

- talk to an attorney about a **dual-license** setup
- keep self-hosting open for personal/non-commercial use
- require a separate commercial-hosting agreement for paid memberships

## Risks / Unknowns

- billing and auth add a lot of operational complexity compared with the current static-host model
- “open source + royalties” is possible, but not from a normal permissive license alone
- if self-hosting stays a first-class goal, entitlement logic needs to degrade gracefully when billing is disabled
- the more premium APIs the app adopts, the more important server-side access control becomes

## Plain-English Recommendation

GridShift can absolutely support host-controlled memberships, but the clean order is:

1. add a backend
2. add auth
3. proxy paid APIs securely
4. add billing
5. choose a commercial-hosting license if royalties matter

For royalties, assume a standard open-source license is **not enough**. That part needs an intentional legal/commercial model.
