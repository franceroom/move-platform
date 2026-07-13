# MOVE platform — plateforme maison France Room

Plateforme de location au mois (move.immo), remplace Sharetribe (décision Elhadji 13/07/2026).
Tous les biens sont gérés par France Room : annonces administrées, demandes de réservation modérées,
encaissement France Room (flux B/C), loyers récurrents via ImmobilierLoyer.

## Stack
Node.js 22 + Express + EJS (SSR bilingue FR/EN), PostgreSQL (`pg`), CSS maison (tokens Move),
libs front par CDN (Mapbox GL, flatpickr). Modules portés depuis move-web : caution Stripe (depositRouter), synchro iCal (icalRouter).

## Démarrer
```
npm install
cp .env.example .env   # renseigner DATABASE_URL au minimum
npm run migrate        # applique db/schema.sql (idempotent)
npm run dev            # http://localhost:3000
```

## Arborescence
- `server/index.js` — app Express, sessions cookie, i18n, statique
- `server/routes/` — routes par domaine (pages, logements, résa, admin…)
- `server/lib/` — i18n, db, helpers
- `views/` — EJS (partials head/foot = layout)
- `locales/fr.json`, `locales/en.json` — tous les textes UI
- `db/schema.sql` — schéma PostgreSQL ; `db/migrate.js` — application
- `public/` — css/js/img statiques

## Déploiement (cible)
Render Web Service (repo GitHub franceroom/move-platform) + Render PostgreSQL.
Build: `npm install` — Start: `npm start`. Env vars: voir `.env.example`.

## Lots
M1 socle ✅ (ce dépôt) · M2 annonces/admin/recherche · M3 calendriers+iCal · M4 résa+paiement+caution · M5 contenus/SEO · M6 recette.
