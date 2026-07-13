-- Données de DEV uniquement (pg-mem). Jamais exécuté en production.
-- Admin dev : admin@move.test / admin1234 (hash bcrypt ci-dessous)
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES ('admin@move.test', '$2a$10$soxbLQ9QY3GUBrtiw8L0resUUHiKJ9LH3MUwgE3dblFPi3vjoUPzK', 'Admin', 'Move', 'admin');

INSERT INTO listings (slug, status, title_fr, title_en, description_fr, description_en, category, subcategory, ville, quartier, lat, lng, surface_m2, loyer_mensuel_cts, frais_menage_cts, depot_garantie_cts)
VALUES
('barbier-t1-meuble-blancarde', 'published',
 'BARBIER - T1 meublé à la Blancarde', 'BARBIER - Furnished studio near Blancarde',
 'T1 meublé refait à neuf, proche métro et gare Blancarde. Location au mois, tout compris.', 'Renovated furnished studio near Blancarde station. Monthly rental, all inclusive.',
 'appartement_maison', 'studio', 'marseille', 'La Blancarde', 43.2977, 5.4085, 22, 90000, 15000, 20000),
('senac-havre-citadin-canebiere', 'published',
 'SENAC - Havre citadin, La Canebière', 'SENAC - City haven on La Canebière',
 'Studio lumineux au coeur de Marseille, sur La Canebière. Tout compris, 1 mois minimum.', 'Bright studio in the heart of Marseille on La Canebière. All inclusive, 1 month minimum.',
 'appartement_maison', 'studio', 'marseille', 'La Canebière', 43.2985, 5.3768, 20, 90000, 12000, 30000),
('t5-renove-balcon-parking', 'published',
 'T5 rénové avec balcon et parking', 'Renovated 4-bedroom with balcony and parking',
 'Grand T5 rénové, balcon, parking. Idéal équipes en mission. Location au mois.', 'Large renovated 4-bedroom, balcony, parking. Ideal for teams on assignment. Monthly rental.',
 'appartement_maison', 'appartement', 'marseille', 'Saint-Barnabé', 43.3062, 5.4203, 95, 350000, 20000, 50000),
('chambre-test-paris-13', 'draft',
 'Chambre meublée - Paris 13e', 'Furnished room - Paris 13th',
 'Chambre dans appartement partagé, Paris 13e. Brouillon de test.', 'Room in shared flat, Paris 13th. Test draft.',
 'chambre', NULL, 'paris', 'Butte-aux-Cailles', 48.8270, 2.3560, 12, 75000, 8000, 50000);

INSERT INTO listing_photos (listing_id, url, alt, position) VALUES
(1, 'https://images.france-room.fr/demo/barbier-1.jpg', 'Séjour', 0),
(1, 'https://images.france-room.fr/demo/barbier-2.jpg', 'Cuisine', 1),
(2, 'https://images.france-room.fr/demo/senac-1.jpg', 'Pièce principale', 0),
(3, 'https://images.france-room.fr/demo/t5-1.jpg', 'Salon', 0);

-- Blocs de test (dev)
INSERT INTO calendar_blocks (listing_id, start_date, end_date, source, source_ref) VALUES
(1, '2026-09-01', '2026-10-01', 'booking', 'resa-test-sept');
UPDATE listings SET ical_import_urls = '["http://localhost:3001/test-fixtures/airbnb-demo.ics"]' WHERE id = 2;
