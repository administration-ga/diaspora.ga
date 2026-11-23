"use client"

/**
 * Un module du réseau fermé, dit dans la section qui en dépend (patron de la section « Mesure »,
 * lot A6) : le moteur refuse alors toute lecture de la section, qui l'explique en termes neutres
 * et renvoie à la section « Modules » pour l'ouvrir, sans jamais rien afficher à la place.
 */
import { Button, Card } from "@diaspora-ga/features"
import { BlocksIcon, LockIcon } from "lucide-react"
import NextLink from "next/link"

import { routes } from "@/lib/routes"

export function ModuleClosedNotice(props: { readonly title: string; readonly body: string; readonly linkLabel: string }) {
  return (
    <Card className="flex min-w-0 flex-col items-start gap-3 p-5">
      <div className="flex min-w-0 gap-3">
        <LockIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-semibold">{props.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{props.body}</p>
        </div>
      </div>
      <Button asChild variant="primary">
        <NextLink href={routes.modules()}>
          <BlocksIcon aria-hidden="true" />
          {props.linkLabel}
        </NextLink>
      </Button>
    </Card>
  )
}
