"use client"

import { cn } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import {
  MEMBER_CREATE_ICONS,
  MEMBER_GATEWAY_GROUP_LABEL_KEY,
  MEMBER_GATEWAY_ICONS,
  MEMBER_MENU_ICONS,
  type MemberMenu,
  type MemberMenuChange,
  type MemberMenuEntry,
} from "@diaspora-ga/features/navigation"
import { Minus, Plus } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"

/**
 * Le menu des membres de diaspora.ga, dessiné tel que la fonction partagée le rend
 * (`@diaspora-ga/features/navigation`, fiche CH-815 § 5) : le rail du bureau (et « Créer »), la
 * barre du téléphone, le menu du compte, ses passerelles vers une autre application (CH-863 :
 * présentes seulement quand leur module est ouvert, ou coché dans l'aperçu) et ses informations.
 * Les libellés et les icônes sont ceux de l'application des membres (espace `diaspora-ga`, table
 * d'icônes partagée) ; rien n'est cliquable : c'est une image du menu, pas une navigation.
 */
export function MemberMenuPreview(props: { menu: MemberMenu; className?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const members = useDiasporaGaT().t
  const { menu } = props
  return (
    <div className={cn("grid min-w-0 gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", props.className)}>
      <PreviewPanel title={t("preview.rail")}>
        <EntryList entries={menu.rail} />
        {menu.create.length > 0 ? (
          <PreviewGroup label={t("preview.createMenu")}>
            <ul className="flex flex-col gap-1">
              {menu.create.map((entry) => {
                const Icon = MEMBER_CREATE_ICONS[entry.id]
                return (
                  <li key={entry.id} className="flex min-w-0 items-start gap-3 rounded-lg px-3 py-2">
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{members(entry.labelKey)}</span>
                      <span className="block text-[13px] leading-snug text-muted-foreground">{members(entry.hintKey)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </PreviewGroup>
        ) : null}
      </PreviewPanel>
      <PreviewPanel title={t("preview.account")}>
        <EntryList entries={menu.account} dense />
        {/* CH-863 : les passerelles vers une autre application (« Démarches administratives »), chacune
            réglée par son module du réseau (fermé par défaut) ; l'application des membres les monte
            avant « Mes données », si l'adresse de l'autre application est configurée. */}
        {menu.gateways.length > 0 ? (
          <PreviewGroup label={members(MEMBER_GATEWAY_GROUP_LABEL_KEY)}>
            <ul className="flex flex-col gap-1">
              {menu.gateways.map((entry) => {
                const Icon = MEMBER_GATEWAY_ICONS[entry.id]
                return (
                  <li key={entry.id} className="flex min-w-0 items-start gap-3 rounded-lg px-3 py-2">
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{members(entry.labelKey)}</span>
                      <span className="block text-[13px] leading-snug text-muted-foreground">{members(entry.hintKey)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="px-3 text-[13px] leading-snug text-muted-foreground">{t("preview.gatewayNote")}</p>
          </PreviewGroup>
        ) : null}
        <PreviewGroup label={t("preview.information")}>
          <EntryList entries={menu.information} dense />
        </PreviewGroup>
      </PreviewPanel>
      <PreviewPanel title={t("preview.phoneBar")} className="min-[1180px]:col-span-2">
        <ul className="flex min-h-16 items-stretch rounded-3xl bg-muted px-1">
          {menu.phoneBar.map((entry) => {
            const Icon = MEMBER_MENU_ICONS[entry.id]
            return (
              <li key={entry.id} className="flex min-w-11 flex-auto flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[11px] font-medium text-muted-foreground">
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span className="max-w-full truncate">{members(entry.labelKey)}</span>
              </li>
            )
          })}
        </ul>
      </PreviewPanel>
    </div>
  )
}

function PreviewPanel(props: { title: string; className?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-card", props.className)}>
      <h3 id={id} className="font-display text-base font-bold">
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}

function PreviewGroup(props: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1 border-t border-border pt-3">
      <p id={id} className="px-3 text-xs font-semibold text-muted-foreground">
        {props.label}
      </p>
      {props.children}
    </div>
  )
}

function EntryList(props: { entries: readonly MemberMenuEntry[]; dense?: boolean }) {
  const members = useDiasporaGaT().t
  return (
    <ul className="flex flex-col gap-0.5">
      {props.entries.map((entry) => {
        const Icon = MEMBER_MENU_ICONS[entry.id]
        return (
          <li key={entry.id} className={cn("flex min-w-0 items-center gap-3 rounded-lg px-3", props.dense ? "min-h-9 text-sm" : "min-h-10 text-[15px]")}>
            <Icon aria-hidden="true" className={cn("shrink-0 text-muted-foreground", props.dense ? "size-4" : "size-5")} />
            <span className="min-w-0 truncate">{members(entry.labelKey)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Où une entrée se tient, en toutes lettres (cliquet des clés). */
const PLACEMENT_KEYS: Readonly<Record<MemberMenuChange["placement"], string>> = {
  bar: "menuChange.placement.bar",
  account: "menuChange.placement.account",
  // CH-863 : le groupe des passerelles du menu du compte, nommé par son titre de membre (`group`).
  gateways: "menuChange.placement.gateways",
  create: "menuChange.placement.create",
}

/** Pour qui l'entrée paraît, quand ce n'est pas tout membre (cliquet des clés). */
const AUDIENCE_KEYS: Readonly<Record<Exclude<MemberMenuChange["audience"], "everyone">, string>> = {
  icom: "menuChange.audience.icom",
  engineNetwork: "menuChange.audience.engineNetwork",
  pageTeam: "menuChange.audience.pageTeam",
  associationMember: "menuChange.audience.associationMember",
  moderator: "menuChange.audience.moderator",
  publisher: "menuChange.audience.publisher",
  registrant: "menuChange.audience.registrant",
}

/** Une entrée qui paraît ou disparaît : son libellé de membre, sa place, son public. */
export function MenuChangeList(props: { changes: readonly MemberMenuChange[]; tone: "added" | "removed"; className?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const members = useDiasporaGaT().t
  const Sign = props.tone === "added" ? Plus : Minus
  return (
    <ul className={cn("flex flex-col gap-1.5", props.className)}>
      {props.changes.map((change) => (
        <li key={`${change.placement}:${change.id}`} className="flex min-w-0 items-start gap-2 text-sm leading-snug">
          <Sign aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="font-semibold">{members(change.labelKey)}</span>
            <span className="text-muted-foreground">
              {" · "}
              {t(PLACEMENT_KEYS[change.placement], { group: members(MEMBER_GATEWAY_GROUP_LABEL_KEY) })}
              {change.audience === "everyone" ? null : <>{" · "}{t(AUDIENCE_KEYS[change.audience])}</>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
