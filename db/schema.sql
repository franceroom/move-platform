-- MOVE platform — schéma initial (M1). PostgreSQL.
-- Conventions : montants en centimes d'euro (INTEGER), dates de séjour en DATE (nuits), horodatage en TIMESTAMPTZ.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant','admin')),
  locale        TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr','en')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id                BIGSERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  title_fr          TEXT NOT NULL,
  title_en          TEXT NOT NULL DEFAULT '',
  description_fr    TEXT NOT NULL DEFAULT '',
  description_en    TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL CHECK (category IN ('chambre','appartement_maison')),
  subcategory       TEXT CHECK (subcategory IS NULL OR subcategory IN ('studio','appartement','maison')),
  ville             TEXT NOT NULL,                    -- paris, marseille, la-ciotat…
  quartier          TEXT NOT NULL DEFAULT '',
  adresse           TEXT NOT NULL DEFAULT '',         -- non affichée publiquement
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  surface_m2        INTEGER,
  meuble            BOOLEAN NOT NULL DEFAULT TRUE,
  charges_comprises BOOLEAN NOT NULL DEFAULT TRUE,
  type_de_bail      TEXT NOT NULL DEFAULT 'selon_situation', -- bail_mobilite / bail_civil / selon_situation
  loyer_mensuel_cts INTEGER NOT NULL,                 -- loyer mensuel TTC charges comprises, en centimes
  frais_menage_cts  INTEGER NOT NULL DEFAULT 0,       -- par séjour, payé par le locataire
  depot_garantie_cts INTEGER NOT NULL DEFAULT 0,
  min_months        INTEGER NOT NULL DEFAULT 1,
  ical_import_urls  JSONB NOT NULL DEFAULT '[]',      -- flux externes (Lodgify/Airbnb)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_search ON listings (status, ville, category);

CREATE TABLE IF NOT EXISTS listing_photos (
  id         BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);

-- Blocs d'indisponibilité : réservations confirmées, blocages manuels, imports iCal.
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id         BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,               -- exclusif (date de départ)
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','booking','ical')),
  source_ref TEXT NOT NULL DEFAULT '',    -- uid iCal ou id de réservation
  CONSTRAINT chk_dates CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_blocks_listing ON calendar_blocks (listing_id, start_date, end_date);

-- Demandes de réservation (request-to-book, modérées par France Room).
CREATE TABLE IF NOT EXISTS booking_requests (
  id            BIGSERIAL PRIMARY KEY,
  listing_id    BIGINT NOT NULL REFERENCES listings(id),
  tenant_id     BIGINT NOT NULL REFERENCES users(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  reserve_pour  TEXT NOT NULL CHECK (reserve_pour IN ('entreprise','usage_personnel','residence_principale')),
  message       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','paid','cancelled','completed')),
  total_first_month_cts INTEGER NOT NULL,  -- 1er mois + frais de ménage
  stripe_session_id     TEXT,
  deposit_status        TEXT NOT NULL DEFAULT 'none'
                CHECK (deposit_status IN ('none','pending','paye','rembourse','litige','erreur_remboursement')),
  deposit_meta  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_req_dates CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON booking_requests (status, listing_id);

-- Candidatures propriétaires (V1 : formulaire, traitement France Room, mandat via DocuSign).
CREATE TABLE IF NOT EXISTS owner_leads (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  ville      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','mandate_sent','signed','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
