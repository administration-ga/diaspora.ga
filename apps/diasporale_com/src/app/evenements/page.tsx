import { redirect } from "next/navigation"

import { routes } from "@/lib/routes"

/**
 * `/evenements` (cahier § 10.1) : les évènements du réseau se lisent dans l'agenda, où le
 * moteur les sert (EV-05 les réunira). L'adresse promise mène donc quelque part, sans
 * second écran à tenir.
 */
export default function EventsPage(): never {
  redirect(routes.agenda())
}
