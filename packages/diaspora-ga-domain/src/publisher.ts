/**
 * L'éditeur de DIASPORA.GA — les faits d'identité que citent les textes du site (mentions
 * légales, confidentialité, conditions d'utilisation, contact). Module PUR.
 *
 * Un seul endroit : les fichiers de langue les reçoivent en variables (`{{publisherRccm}}`…),
 * jamais recopiés d'un texte à l'autre. Ce sont les mentions que l'éditeur publie déjà pour ses
 * autres services (immatriculation de la société, siège, représentant légal, adresse de
 * contact) ; l'article 25 de l'ordonnance n° 0011/PR/2026 les impose à l'éditeur d'un réseau
 * social. Aucune adresse personnelle : l'adresse de contact est une adresse de rôle.
 *
 * Changer une valeur ici change les textes qui la citent : leur version et leur date
 * (`LEGAL_TEXTS`) changent alors aussi.
 */
export interface Publisher {
  /** Dénomination sociale. */
  readonly name: string
  /** Capital social, avec sa devise. */
  readonly capital: string
  /** Numéro au registre du commerce et du crédit mobilier. */
  readonly rccm: string
  /** Numéro d'identification fiscale. */
  readonly nif: string
  /** Siège social, sur une ligne. */
  readonly address: string
  readonly phone: string
  /** Adresse de contact de l'éditeur : service, données personnelles, demandes légales. */
  readonly email: string
  /** Le site de la société, sans protocole : un nom, pas un lien. */
  readonly website: string
  /** Le représentant légal, directeur de la publication : Prénom puis NOM en capitales. */
  readonly representative: string
}

export const PUBLISHER: Publisher = Object.freeze({
  name: "NTSAGUI DIGITAL",
  capital: "5 000 000 FCFA",
  rccm: "GA-LBV-01-2025-B12-01029",
  nif: "2025 0102 2429 R",
  address: "Batterie IV, Rue des Résidences, BP 638, Libreville, Gabon",
  phone: "+241 066 83 06 73",
  email: "admin@ntsagui.com",
  website: "ntsagui.com",
  representative: "Yoann ETENO-MBOUROU",
})

/**
 * Les variables que les textes du site reçoivent par défaut : une par fait, au nom explicite,
 * pour qu'une phrase qui en oublie une ne reçoive jamais une autre valeur en silence.
 */
export const PUBLISHER_TEXT_VARIABLES = Object.freeze({
  publisherName: PUBLISHER.name,
  publisherCapital: PUBLISHER.capital,
  publisherRccm: PUBLISHER.rccm,
  publisherNif: PUBLISHER.nif,
  publisherAddress: PUBLISHER.address,
  publisherPhone: PUBLISHER.phone,
  publisherEmail: PUBLISHER.email,
  publisherWebsite: PUBLISHER.website,
  publisherRepresentative: PUBLISHER.representative,
} as const satisfies Record<string, string>)
