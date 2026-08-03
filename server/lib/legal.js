// Contenu des pages légales. Mentions légales = factuel (rédigé). CGU/CGV + RGPD = fournis par le conseil (placeholder tant qu'absent).
const MAJ = "3 août 2026";

const mentionsLegales = `
<h1>Mentions légales</h1>
<p class="muted">Dernière mise à jour : 3 août 2026 — conformément à la loi n°&nbsp;2004-575 du 21 juin 2004 (LCEN)</p>

<h2>Éditeur du site</h2>
<p>
Le site <strong>move.immo</strong> est édité par <strong>FRANCE ROOM</strong>, société à responsabilité limitée (SARL) au capital de 10&nbsp;000&nbsp;€, immatriculée au Registre du commerce et des sociétés de Marseille sous le numéro 831&nbsp;405&nbsp;147, dont le siège social est situé 165 Boulevard Boisson, 13004 Marseille — France.<br>
N°&nbsp;de TVA intracommunautaire : FR36831405147. Code APE : 6831Z.<br>
E-mail : <a href="mailto:contact@france-room.fr">contact@france-room.fr</a>. Téléphone : +33&nbsp;9&nbsp;80&nbsp;80&nbsp;83&nbsp;86.
</p>
<p><em>MOVE (« Move by France Room ») est la marque commerciale sous laquelle FRANCE ROOM exploite la plateforme move.immo, dédiée à la location meublée de moyenne durée (1 mois et plus).</em></p>

<h2>Directeur de la publication</h2>
<p>Monsieur Elhadji Moussa FALL, gérant de FRANCE ROOM.</p>

<h2>Activité réglementée — loi Hoguet</h2>
<p>
FRANCE ROOM est titulaire de la carte professionnelle n°&nbsp;<strong>CPI 1301 2018 000 034 274</strong> portant les mentions «&nbsp;Transaction sur immeubles et fonds de commerce&nbsp;» et «&nbsp;Gestion immobilière&nbsp;», délivrée par la Chambre de Commerce et d'Industrie de Marseille-Provence, en application de la loi n°&nbsp;70-9 du 2 janvier 1970 et du décret n°&nbsp;72-678 du 20 juillet 1972.<br>
Garantie financière de 200&nbsp;000&nbsp;€, couvrant notamment les fonds détenus pour le compte de tiers au titre de l'activité de gestion immobilière. Les références du garant sont communiquées sur demande écrite à <a href="mailto:contact@france-room.fr">contact@france-room.fr</a> et figurent sur les documents contractuels.<br>
Assurance responsabilité civile professionnelle souscrite auprès de <strong>HISCOX</strong>. Les références de la police sont communiquées sur demande écrite à <a href="mailto:contact@france-room.fr">contact@france-room.fr</a>.
</p>
<p>FRANCE ROOM adhère au code de déontologie des professions immobilières (décret n°&nbsp;2015-1090 du 28 août 2015).</p>

<h2>Hébergeur</h2>
<p>
Le site est hébergé par <strong>Render</strong> (Render Services, Inc.), 525 Brannan Street, Suite 300, San Francisco, CA 94107, États-Unis — <a href="https://render.com" target="_blank" rel="noopener">render.com</a>.<br>
Base de données hébergée dans l'Union européenne (région de Francfort, Allemagne).
</p>

<h2>Médiation de la consommation</h2>
<p>
Conformément aux articles L.&nbsp;612-1 et suivants du Code de la consommation, le consommateur peut recourir gratuitement, après réclamation écrite préalable restée infructueuse, au médiateur de la consommation dont relève FRANCE ROOM. Les coordonnées du médiateur seront publiées sur cette page dès finalisation de l'adhésion en cours.<br>
Plateforme européenne de règlement en ligne des litiges : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">ec.europa.eu/consumers/odr</a>.
</p>

<h2>Propriété intellectuelle</h2>
<p>
L'ensemble des éléments du site move.immo (structure, textes, graphismes, logos, photographies, bases de données) est protégé par le Code de la propriété intellectuelle et demeure la propriété exclusive de FRANCE ROOM ou de ses concédants. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable, est interdite.
</p>

<h2>Données personnelles et cookies</h2>
<p>
Les traitements de données à caractère personnel réalisés via le site sont décrits dans la <a href="/confidentialite">politique de confidentialité</a>, conformément au RGPD et à la loi «&nbsp;Informatique et Libertés&nbsp;». Pour toute question ou pour exercer vos droits : <a href="mailto:contact@france-room.fr">contact@france-room.fr</a>. Vous disposez du droit d'introduire une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener">www.cnil.fr</a>).
</p>

<h2>Documents contractuels</h2>
<p>
L'utilisation du site est régie par les <a href="/cgu">Conditions Générales d'Utilisation</a>&nbsp;; les réservations de logements sont régies par les Conditions Générales de Vente et de Location, accessibles en permanence sur le site.
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
