import { createAuthProxyHandlers } from "@antsia/api/auth-proxy"

/**
 * Proxy de même origine vers les seules actions d'authentification du moteur, SANS aucun cookie du
 * navigateur, dans un sens comme dans l'autre (revue de sécurité A1 : admin.diaspora.ga et
 * diaspora.ga sont du même site, `SameSite` ne protège pas d'un cookie déposé par un voisin du
 * domaine). La session de cette application ne vit que dans `Better-Auth-Cookie` /
 * `Set-Better-Auth-Cookie` (greffon `crossDomain`, `credentials: "omit"`), qui passent.
 *
 * Le relais commun du moteur porte l'option depuis son durcissement (`browserCookies: "drop"`,
 * CH-815 A1b) : le `Cookie` entrant ne part pas, aucun `Set-Cookie` ne revient, et un rappel OAuth
 * ne relaie ni cookie ni jeton porteur. Il remplace l'enveloppe propre à l'application
 * (`src/lib/auth-relay.ts`, retirée au lot A7).
 */
export const { DELETE, GET, PATCH, POST, PUT } = createAuthProxyHandlers({ browserCookies: "drop" })
