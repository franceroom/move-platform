// Contenu des pages légales. Mentions légales = factuel (rédigé). CGU/CGV + RGPD = fournis par le conseil (placeholder tant qu'absent).
const MAJ = "16 juillet 2026";

const mentionsLegales = `
<h1>Mentions légales</h1>
<p class="muted">Dernière mise à jour : ${MAJ}</p>

<h2>Éditeur du site</h2>
<p>
Le site <strong>move.immo</strong> est édité par <strong>FRANCE ROOM</strong>, société à responsabilité limitée (SARL) au capital social de 10&nbsp;000&nbsp;€.<br>
Siège social : 165 Boulevard Boisson, 13004 Marseille, France.<br>
SIREN : 831&nbsp;405&nbsp;147 — RCS Marseille 831&nbsp;405&nbsp;147.<br>
Gérant et directeur de la publication : Elhadji Moussa FALL.<br>
Contact : <a href="mailto:contact@france-room.fr">contact@france-room.fr</a>.
</p>
<p><em>« Move » est une marque commerciale de FRANCE ROOM.</em></p>

<h2>Activité de gestion immobilière</h2>
<p>
FRANCE ROOM exerce une activité de gestion immobilière régie par la loi n°&nbsp;70-9 du 2 janvier 1970 (loi Hoguet).<br>
Carte professionnelle « Gestion immobilière » (carte G) n°&nbsp;<strong>[À COMPLÉTER]</strong>, délivrée par la CCI de <strong>[À COMPLÉTER]</strong>.<br>
Garant financier : <strong>[À COMPLÉTER — nom, adresse et montant de la garantie]</strong>.<br>
Assurance responsabilité civile professionnelle : <strong>[À COMPLÉTER — assureur et n° de police]</strong>.
</p>

<h2>Hébergement</h2>
<p>
Le site est hébergé par <strong>Render</strong> (Render Services, Inc.), San Francisco, Californie, États-Unis — <a href="https://render.com" target="_blank" rel="noopener">render.com</a>.<br>
Base de données hébergée dans l'Union européenne (région de Francfort, Allemagne).
</p>

<h2>Propriété intellectuelle</h2>
<p>
L'ensemble des contenus du site (textes, photographies, logo « Move », charte graphique) est protégé par le droit de la propriété intellectuelle et demeure la propriété de FRANCE ROOM ou de ses partenaires. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable, est interdite.
</p>

<h2>Données personnelles</h2>
<p>
Le traitement des données personnelles est décrit dans notre <a href="/confidentialite">politique de confidentialité</a>. Conformément au RGPD et à la loi « Informatique et Libertés », vous disposez d'un droit d'accès, de rectification, d'effacement et d'opposition sur vos données, exerçable à l'adresse <a href="mailto:contact@france-room.fr">contact@france-room.fr</a>.
</p>

<h2>Médiation de la consommation</h2>
<p>
Conformément aux articles L.&nbsp;611-1 et suivants du Code de la consommation, tout consommateur peut recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d'un litige.<br>
Médiateur compétent : <strong>[À COMPLÉTER — nom et coordonnées du médiateur]</strong>.<br>
Plateforme européenne de règlement en ligne des litiges : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">ec.europa.eu/consumers/odr</a>.
</p>
`;

const legalPending = (title) => `
<h1>${title}</h1>
<p class="muted">Ce document est en cours de finalisation et sera publié prochainement.</p>
`;

function html(slug) {
  if (slug === "mentions-legales") return mentionsLegales;
  if (slug === "cgu") return legalPending("Conditions générales d'utilisation et de vente");
  if (slug === "confidentialite") return legalPending("Politique de confidentialité");
  return legalPending("Document");
}

module.exports = { html };
