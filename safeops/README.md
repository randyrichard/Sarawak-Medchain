# safeops/ — legacy prototype (superseded)

This is the original SafeOps design prototype. **It is not the product.**

It renders from `src/data/mock.ts` and has no backend, no database and no
authentication. There is no account page, no preferences, no working search — the
search box in the header is a static input with no handler. Nothing here writes
anything down.

## The real application is `safeops-platform/`

| | `safeops/` (here) | `safeops-platform/` |
|---|---|---|
| Data | `mock.ts` fixtures | PostgreSQL via Prisma |
| Backend | none | Express API on :4000 |
| Auth | none | JWT + refresh cookie |
| Search / account / preferences | absent | working |
| Port | 5180 | 5181 |

Start the real stack — this brings up the database, the API and the web app
together, which is why starting the web app on its own leaves every screen empty:

```bash
npm run dev --prefix safeops-platform
```

Then open http://localhost:5181.

This folder is kept only for reference to the original visual design. If you are
looking for a feature and cannot find it here, that is expected — look in
`safeops-platform/web/src/features/`.
