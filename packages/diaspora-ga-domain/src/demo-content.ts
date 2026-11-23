/**
 * Publications d'EXEMPLE du réseau de démonstration de DIASPORA.GA (CH-817).
 *
 * Données pures, lues par la tranche `convex/modules/diaspora` du moteur, qui les
 * écrit à l'équipement de chaque acteur (clé stable, visibilité `network`, texte
 * seul) : rien n'est publié par ce module. Chaque acteur qui peut publier (statut
 * effectif déclaré ou vérifié) a deux ou trois publications personnelles ; chaque
 * acteur de page, deux de plus au nom de sa page. Quelques réactions et un
 * commentaire entre acteurs donnent vie au fil, jamais entre un acteur bloqué et
 * celui qui le bloque.
 *
 * Tout est FICTIF et marqué « Démo — » : aucune personne ni organisation réelle,
 * aucun chiffre, aucune coordonnée, aucune affirmation sur les services consulaires.
 * Les textes s'en tiennent à ce qui est ouvert au lancement (le socle et les pages) :
 * la vie quotidienne de la diaspora en France, sans promettre un module fermé
 * (boutique, emploi, réservation, accompagnement, inscription à un évènement).
 */
import { DIASPORA_GA_DEMO_ACTOR_SPECS, type DiasporaGaDemoActor } from "./demo-accounts"
import type { EngineReactionKind } from "./engine"
import type { ContentScope, Reach } from "./reach"

/** Le repère de toute publication et de tout commentaire de démonstration. */
export const DIASPORA_GA_DEMO_CONTENT_MARKER = "Démo — "

/** `person` : publication personnelle ; `page` : publiée au nom de la page de l'acteur. */
export const DIASPORA_GA_DEMO_POST_AUTHORS = ["person", "page"] as const
export type DiasporaGaDemoPostAuthor = (typeof DIASPORA_GA_DEMO_POST_AUTHORS)[number]

/** Une réaction déclarée, posée dès que les deux comptes existent. */
export interface DiasporaGaDemoReaction {
  readonly actor: DiasporaGaDemoActor
  readonly kind: EngineReactionKind
}

/** Le commentaire d'un autre acteur sous la publication. */
export interface DiasporaGaDemoComment {
  readonly actor: DiasporaGaDemoActor
  readonly body: string
}

export interface DiasporaGaDemoPost {
  /** Repère stable, `<acteur>:<repère>` : les clés d'idempotence du moteur en dérivent. */
  readonly key: string
  /** L'acteur qui publie, en son nom ou au nom de sa page (`author`). */
  readonly actor: DiasporaGaDemoActor
  readonly author: DiasporaGaDemoPostAuthor
  readonly body: string
  /** Le hub du pays de l'acteur (`local`), ou tous les hubs avec son pays d'origine (`diaspora`). */
  readonly scope: ContentScope
  /** Toujours dans le réseau : une publication de démonstration ne sort jamais vers la racine. */
  readonly visibility: "network"
  readonly reactions: readonly DiasporaGaDemoReaction[]
  readonly comment: DiasporaGaDemoComment | null
}

interface PostInput {
  readonly author?: DiasporaGaDemoPostAuthor
  readonly reach?: Reach
  readonly body: string
  readonly reactions?: readonly (readonly [DiasporaGaDemoActor, EngineReactionKind])[]
  readonly comment?: readonly [DiasporaGaDemoActor, string]
}

/** Une publication, dans le pays de son acteur (la portée ne se choisit pas ailleurs que chez lui). */
function post(actor: DiasporaGaDemoActor, marker: string, input: PostInput): DiasporaGaDemoPost {
  const country = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].country
  return {
    key: `${actor}:${marker}`,
    actor,
    author: input.author ?? "person",
    body: input.body,
    scope: input.reach === "diaspora" ? { reach: "diaspora", country } : { reach: "local", country },
    visibility: "network",
    reactions: (input.reactions ?? []).map(([reactor, kind]) => ({ actor: reactor, kind })),
    comment: input.comment === undefined ? null : { actor: input.comment[0], body: input.comment[1] },
  }
}

/** Les publications d'exemple, acteur par acteur, dans l'ordre du panneau. */
export const DIASPORA_GA_DEMO_POSTS: readonly DiasporaGaDemoPost[] = [
  // Membres
  post("declare", "arrivee", {
    body: "Démo — Premier hiver en France pour moi : j'apprends à superposer les couches et à apprécier les soupes du soir. Vous qui êtes arrivés avant moi, quel conseil auriez-vous aimé recevoir la première semaine ? #Arrivee #France",
    reactions: [["fondateur", "soutien"], ["parraine", "like"]],
    comment: ["fondateur", "Démo — Garde toujours un parapluie dans ton sac, et n'hésite pas à poser tes questions ici."],
  }),
  post("declare", "marche", {
    body: "Démo — Belle découverte ce samedi : un marché de quartier où l'on trouve du manioc et des feuilles de manioc. Le goût de la maison, à quelques stations de chez moi. #Cuisine #VieQuotidienne",
    reactions: [["entreprise", "bravo"], ["verifie", "like"]],
    comment: ["entreprise", "Démo — Rien ne remplace un bon plat de feuilles de manioc le dimanche."],
  }),
  post("parraine", "merci", {
    body: "Démo — Merci au membre qui m'a parrainée dans ce réseau de démonstration : entrer par la confiance de quelqu'un, c'est se sentir attendue. #Bienvenue #Parrainage",
    reactions: [["verifie", "soutien"], ["fondateur", "like"]],
    comment: ["verifie", "Démo — Avec plaisir. Bienvenue parmi nous !"],
  }),
  post("parraine", "etudes", {
    reach: "diaspora",
    body: "Démo — Reprise des cours cette semaine : bibliothèque le matin, travail en groupe l'après-midi. Étudiantes et étudiants de la diaspora, comment organisez-vous vos révisions ? #VieEtudiante #Diaspora",
    reactions: [["declare", "like"], ["association", "like"]],
    comment: ["declare", "Démo — À plusieurs : chacun explique un chapitre aux autres, et tout le monde révise mieux."],
  }),
  post("verifie", "parrainer", {
    body: "Démo — Parrainer un nouveau membre, c'est d'abord prendre le temps d'un échange : d'où il vient, ce qu'il cherche, ce qu'il peut apporter. Une belle façon de faire grandir le réseau. #Parrainage #VieDuReseau",
    reactions: [["fondateur", "bravo"], ["administrateur", "like"]],
    comment: ["fondateur", "Démo — C'est exactement l'esprit du réseau, merci."],
  }),
  post("verifie", "dimanche", {
    body: "Démo — Dimanche en famille : poulet à l'odika, bananes plantain et longues discussions au téléphone avec le pays. Ces moments-là font oublier la distance. #Cuisine #Famille",
    reactions: [["entreprise", "like"], ["declare", "soutien"]],
    comment: ["entreprise", "Démo — L'odika, la meilleure façon de finir la semaine."],
  }),
  post("verifie", "transports", {
    body: "Démo — Petit conseil aux nouveaux arrivants : regardez les horaires des transports le dimanche, ils sont souvent réduits. Prévoir un peu de marge évite bien des courses. #Arrivee #Conseil",
    reactions: [["parraine", "instructif"]],
  }),
  post("fondateur", "bienvenue", {
    reach: "diaspora",
    body: "Démo — Bienvenue à toutes celles et à tous ceux qui découvrent ce réseau de démonstration. Ici, on se présente, on s'entraide et on garde le lien avec le pays, d'où que l'on écrive. #Bienvenue #Diaspora",
    reactions: [["declare", "like"], ["parraine", "like"], ["moderateur", "soutien"]],
    comment: ["moderateur", "Démo — Bienvenue à toutes et à tous ! Une question claire et une réponse respectueuse : c'est la règle d'or."],
  }),
  post("fondateur", "lettres", {
    body: "Démo — En rangeant mes cartons, j'ai retrouvé les premières lettres reçues du pays. Aujourd'hui, les nouvelles arrivent en un instant, mais l'émotion reste la même. #Souvenirs #Famille",
    reactions: [["verifie", "soutien"], ["institution", "like"]],
    comment: ["verifie", "Démo — Garde-les précieusement, ce sont de vrais trésors."],
  }),
  post("fondateur", "presentations", {
    body: "Démo — Et si chacun se présentait en trois mots ? Je commence : curieuse, patiente, gourmande. À vous ! #Presentations #VieDuReseau",
    reactions: [["association", "bravo"], ["entreprise", "like"]],
    comment: ["association", "Démo — Engagée, joyeuse et un peu bavarde !"],
  }),
  post("belgique", "bruxelles", {
    body: "Démo — Bonjour depuis Bruxelles ! Entre deux averses, je découvre les petits cafés du quartier et la douceur des gaufres. Qui d'autre vit en Belgique ici ? #Belgique #Bruxelles",
    reactions: [["canada", "like"]],
    comment: ["canada", "Démo — Bonjour de l'autre côté de l'Atlantique !"],
  }),
  post("belgique", "langues", {
    reach: "diaspora",
    body: "Démo — Ici, on entend le français, le néerlandais et bien d'autres langues dans la même rue. Et vous, quelle langue du pays parlez-vous encore à la maison ? #Langues #Diaspora",
    reactions: [["fondateur", "instructif"], ["verifie", "like"]],
    comment: ["fondateur", "Démo — Le fang avec mes parents, le français avec mes enfants."],
  }),
  post("canada", "hiver", {
    body: "Démo — Premier vrai hiver à Montréal : la neige, le froid sec et des voisins qui m'ont tout appris sur les bonnes bottes. La solidarité commence souvent sur le trottoir. #Canada #Montreal",
    reactions: [["belgique", "soutien"]],
    comment: ["belgique", "Démo — Courage pour l'hiver, et profite des premières neiges !"],
  }),
  post("canada", "decalage", {
    reach: "diaspora",
    body: "Démo — Appeler la famille avec le décalage horaire demande un peu d'organisation : un message le soir, une réponse au réveil. Comment gardez-vous le lien, vous ? #Famille #Diaspora",
    reactions: [["fondateur", "like"], ["declare", "like"]],
    comment: ["declare", "Démo — Un appel vidéo le dimanche, c'est sacré chez nous."],
  }),

  // Pages : chaque acteur publie en son nom, puis au nom de sa page
  post("association", "lyon", {
    body: "Démo — Lyon s'éveille sous la brume ce matin. Avant la réunion de l'association, un café avec des membres arrivés récemment : chacun repart avec un contact et un sourire. #Lyon #VieAssociative",
    reactions: [["fondateur", "like"], ["declare", "like"]],
    comment: ["declare", "Démo — Ces cafés d'accueil font vraiment du bien."],
  }),
  post("association", "nyembwe", {
    body: "Démo — Quelqu'un aurait une bonne recette de nyembwe pour une grande tablée ? Je cherche la version de nos grands-mères. #Cuisine #Partage",
    reactions: [["entreprise", "instructif"]],
    comment: ["entreprise", "Démo — De l'huile de palme rouge, du temps et beaucoup de patience !"],
  }),
  post("association", "page-presentation", {
    author: "page",
    body: "Démo — L'Association des Gabonais de Lyon, page fictive de démonstration, réunit des familles, des étudiants et des retraités autour de la culture et de l'entraide. Présentez-vous en commentaire ! #Lyon #Association",
    reactions: [["fondateur", "bravo"], ["parraine", "like"]],
    comment: ["parraine", "Démo — Ravie de découvrir l'association !"],
  }),
  post("association", "page-reunion", {
    author: "page",
    body: "Démo — Compte rendu de notre réunion fictive du mois : accueil des nouveaux arrivants, soirée contes pour les enfants et idées de sorties en famille. Merci à toutes les personnes présentes. #Lyon #VieAssociative",
    reactions: [["administrateur", "like"], ["verifie", "bravo"]],
  }),
  post("entreprise", "cuisine", {
    body: "Démo — Journée en cuisine : préparer les feuilles de manioc prend du temps, mais c'est ce temps qui fait le goût. Le métier de traiteur, c'est aussi transmettre. #Cuisine #Paris",
    reactions: [["verifie", "like"], ["declare", "bravo"]],
    comment: ["verifie", "Démo — On sent la passion dans chaque mot."],
  }),
  post("entreprise", "se-lancer", {
    reach: "diaspora",
    body: "Démo — Aux entrepreneurs de la diaspora : quelle a été votre première difficulté en vous lançant ? Pour moi, ce fut d'apprendre à dire non à certains projets. #Entrepreneuriat #Diaspora",
    reactions: [["administrateur", "instructif"], ["fondateur", "like"]],
    comment: ["administrateur", "Démo — Apprendre à choisir ses priorités : la leçon de toute une carrière."],
  }),
  post("entreprise", "page-presentation", {
    author: "page",
    body: "Démo — Saveurs du Gabon, entreprise fictive de démonstration, se présente : une petite équipe de traiteur à Paris qui cuisine les recettes de famille. Cette page montre une entreprise du réseau, rien de plus. #Paris #Cuisine",
    reactions: [["association", "bravo"], ["parraine", "like"]],
    comment: ["association", "Démo — Bienvenue sur le réseau, toute l'équipe !"],
  }),
  post("entreprise", "page-coulisses", {
    author: "page",
    body: "Démo — Dans les coulisses de Saveurs du Gabon : le marché tôt le matin, les épices qu'on torréfie et la cuisine qu'on range en chantant. Une journée ordinaire de notre équipe fictive. #Paris #Coulisses",
    reactions: [["declare", "like"]],
  }),
  post("media", "terrain", {
    body: "Démo — Journée de terrain fictive : écouter, noter, puis vérifier avant d'écrire. Raconter la diaspora, c'est d'abord donner la parole à celles et ceux qui la vivent. #Journalisme #Paris",
    reactions: [["communaute", "like"]],
  }),
  post("media", "verifier", {
    reach: "diaspora",
    body: "Démo — Avant de partager une information, trois questions : qui la publie, de quand date-t-elle, et d'autres sources la confirment-elles ? Un réflexe simple contre les fausses nouvelles. #Information #EspritCritique",
    reactions: [["moderateur", "instructif"], ["fondateur", "like"]],
    comment: ["moderateur", "Démo — Un réflexe simple, à partager largement."],
  }),
  post("media", "page-presentation", {
    author: "page",
    body: "Démo — Diaspora Info, média fictif de démonstration, publie ici des récits de la vie quotidienne de la diaspora. Aucune actualité réelle n'est annoncée sur cette page. #Diaspora #Recits",
    reactions: [["communaute", "bravo"]],
  }),
  post("media", "page-portrait", {
    author: "page",
    body: "Démo — Portrait fictif de la semaine : une étudiante arrivée à Paris raconte ses premiers pas, ses doutes et les amitiés nouées en chemin. Un récit inventé pour la démonstration. #Portrait #VieEtudiante",
    reactions: [["parraine", "soutien"]],
  }),
  post("communaute", "quais", {
    body: "Démo — Fin de journée sur les quais de Bordeaux avec d'autres étudiants du collectif : on parle examens, cuisine et nouvelles du pays. #Bordeaux #VieEtudiante",
    reactions: [["media", "like"]],
  }),
  post("communaute", "colocation", {
    body: "Démo — Vivre en colocation, c'est apprendre à partager le frigo, le calme et les playlists. Quelles sont vos meilleures règles de vie commune ? #Colocation #VieEtudiante",
    reactions: [["parraine", "like"]],
    comment: ["parraine", "Démo — Un tableau des tâches sur le frigo, et tout va mieux !"],
  }),
  post("communaute", "page-presentation", {
    author: "page",
    body: "Démo — Le Collectif des étudiants de Bordeaux, collectif fictif de démonstration, rassemble des étudiants qui s'entraident dans les études et la vie quotidienne. #Bordeaux #Etudiants",
    reactions: [["media", "bravo"]],
  }),
  post("communaute", "page-revisions", {
    author: "page",
    body: "Démo — Rappel du collectif fictif : les révisions en groupe continuent à la bibliothèque du campus. Apportez vos questions, on cherche les réponses ensemble. #Bordeaux #Revisions",
    reactions: [["parraine", "like"]],
  }),
  post("institution", "accueil", {
    body: "Démo — Accueillir, écouter, orienter : trois gestes simples que je retrouve chaque jour dans mon travail d'agent public fictif. Merci pour votre patience et votre courtoisie. #Accueil #Paris",
    reactions: [["fondateur", "like"], ["administrateur", "like"]],
    comment: ["administrateur", "Démo — Merci pour cet engagement au quotidien."],
  }),
  post("institution", "langues", {
    reach: "diaspora",
    body: "Démo — Transmettre les langues du pays aux enfants nés loin du Gabon : beaucoup de familles relèvent ce défi avec des chansons, des contes et des appels aux grands-parents. #Langues #Famille",
    reactions: [["association", "soutien"], ["verifie", "like"]],
    comment: ["association", "Démo — Les contes du soir, chez nous, c'est en punu."],
  }),
  post("institution", "page-prudence", {
    author: "page",
    body: "Démo — Avis pratique de cette page institutionnelle fictive : ne publiez jamais de pièce d'identité ni de document personnel sur le réseau, pas plus que dans un message. Cette page de démonstration ne représente aucune administration réelle. #Prudence #VieDuReseau",
    reactions: [["moderateur", "instructif"], ["declare", "like"]],
    comment: ["moderateur", "Démo — Rappel essentiel, merci."],
  }),
  post("institution", "page-bienvenue", {
    author: "page",
    reach: "diaspora",
    body: "Démo — Bienvenue aux personnes récemment arrivées : cette page institutionnelle fictive partage des conseils généraux de prudence et de bon voisinage. Elle ne remplace aucune administration réelle. #Bienvenue #Diaspora",
    reactions: [["parraine", "like"]],
  }),

  // Rôles
  post("mentor", "lecture", {
    body: "Démo — Je relis en ce moment un roman découvert dans ma jeunesse. Les mêmes pages racontent autre chose quand on a traversé quelques saisons loin du pays. Quel livre vous accompagne ? #Lecture #Culture",
    reactions: [["fondateur", "like"], ["institution", "like"]],
    comment: ["fondateur", "Démo — Je relis souvent les contes de mon enfance."],
  }),
  post("mentor", "demander", {
    reach: "diaspora",
    body: "Démo — Un conseil reçu à mon arrivée : demander de l'aide n'est pas une faiblesse. Poser une question tôt évite souvent de longs détours. #Arrivee #Conseil",
    reactions: [["declare", "soutien"], ["parraine", "like"]],
  }),
  post("talent", "apprendre", {
    body: "Démo — Week-end studieux : un petit projet personnel pour apprendre un nouveau langage de programmation. Les erreurs du soir deviennent les leçons du matin. #Numerique #Apprendre",
    reactions: [["verifie", "bravo"], ["administrateur", "like"]],
    comment: ["administrateur", "Démo — Belle persévérance, continue !"],
  }),
  post("talent", "astuces", {
    body: "Démo — Café entre passionnés de code ce soir, avec d'autres membres de la diaspora : partager ses astuces fait gagner un temps précieux. #Numerique #Rencontres",
    reactions: [["entreprise", "like"]],
  }),
  post("moderateur", "desaccord", {
    reach: "diaspora",
    body: "Démo — Rappel bienveillant pour notre communauté de démonstration : on peut être en désaccord sans blesser. Critiquer une idée, jamais une personne. #VieDuReseau #Respect",
    reactions: [["fondateur", "bravo"], ["administrateur", "like"], ["verifie", "like"]],
    comment: ["fondateur", "Démo — À garder en tête dans chaque échange."],
  }),
  post("moderateur", "signaler", {
    body: "Démo — Un contenu vous semble déplacé ? Ouvrez le menu de la publication et signalez-le en indiquant la raison. Chaque signalement est relu avec attention. #VieDuReseau #Securite",
    reactions: [["institution", "instructif"], ["declare", "like"]],
  }),
  post("moderateur", "coordonnees", {
    body: "Démo — Pour échanger avec un membre, passez par la messagerie : gardez vos coordonnées privées et demandez l'accord avant de publier la photo de quelqu'un. #Prudence #VieDuReseau",
    reactions: [["parraine", "instructif"]],
    comment: ["parraine", "Démo — Bon à savoir, merci pour le rappel."],
  }),
  post("administrateur", "decouvrir", {
    reach: "diaspora",
    body: "Démo — Bienvenue sur la démonstration du réseau : le fil, les profils, la messagerie et les pages sont là pour découvrir comment la diaspora échange. Tout ce que vous lisez ici est fictif. #VieDuReseau #Demonstration",
    reactions: [["fondateur", "like"], ["moderateur", "bravo"]],
    comment: ["moderateur", "Démo — Et l'équipe de modération veille sur les échanges."],
  }),
  post("administrateur", "impressions", {
    body: "Démo — Vos impressions sur cette démonstration nous intéressent : ce qui vous semble clair, ce qui vous manque. Dites-le en commentaire. #VieDuReseau #Retours",
    reactions: [["verifie", "like"], ["association", "like"]],
    comment: ["association", "Démo — Une interface claire, on s'y retrouve vite."],
  }),

  // Accès restreints : le membre bloqué publie, mais rien ne le relie à celui qui le bloque
  post("bloque", "balade", {
    body: "Démo — Balade du dimanche au bord de l'eau : un peu d'air frais avant une semaine chargée. Bon début de semaine à toutes et à tous. #VieQuotidienne",
    reactions: [["declare", "like"]],
  }),
  post("bloque", "chansons", {
    body: "Démo — En ce moment, j'écoute en boucle des chansons qui me rappellent les fêtes au village. Quelle chanson vous ramène au pays ? #Musique #Souvenirs",
    reactions: [["fondateur", "like"]],
    comment: ["fondateur", "Démo — Les chants des veillées, à chaque fois."],
  }),
]

/** Peut publier : un statut effectif déclaré ou vérifié (« nouveau » et « leger » ne publient rien). */
export function diasporaGaDemoCanPublish(actor: DiasporaGaDemoActor): boolean {
  const status = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].expectedStatus
  return status === "declaree" || status === "verifiee"
}

/** Les publications qu'un acteur écrit, en son nom et au nom de sa page, dans l'ordre. */
export function diasporaGaDemoPostsOf(actor: DiasporaGaDemoActor): DiasporaGaDemoPost[] {
  return DIASPORA_GA_DEMO_POSTS.filter((entry) => entry.actor === actor)
}

/**
 * Les publications où un acteur a un rôle : il les écrit, y réagit ou les commente.
 * À l'équipement d'un acteur, le moteur y pose ce qui peut l'être (les deux comptes
 * existent), quel que soit l'ordre dans lequel les acteurs arrivent.
 */
export function diasporaGaDemoPostsInvolving(actor: DiasporaGaDemoActor): DiasporaGaDemoPost[] {
  return DIASPORA_GA_DEMO_POSTS.filter(
    (entry) => entry.actor === actor || entry.reactions.some((reaction) => reaction.actor === actor) || entry.comment?.actor === actor,
  )
}

/** La clé d'idempotence de la publication : une publication retirée n'est jamais recréée. */
export function diasporaGaDemoPostIdempotencyKey(entry: Pick<DiasporaGaDemoPost, "key">): string {
  return `diaspora-ga-demo:post:${entry.key}`
}

/** La clé d'idempotence du commentaire de la publication. */
export function diasporaGaDemoCommentIdempotencyKey(entry: Pick<DiasporaGaDemoPost, "key">): string {
  return `diaspora-ga-demo:comment:${entry.key}`
}
