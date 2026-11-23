"use client"

import { Button, Card } from "@diaspora-ga/features"
import { RotateCwIcon } from "lucide-react"
import { Component, Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"

type Fallback = (error: unknown, retry: () => void) => ReactNode
type BoundaryState = { caught: boolean; error: unknown; attempt: number }

/**
 * Une lecture du moteur qui échoue dans une section (refus, panne) ne remonte pas jusqu'à la
 * garde : la section dit le refus par la traduction partagée des codes du moteur et se relit à la
 * demande. Le refus d'un administrateur qui a perdu son rôle est aussi vu par la garde, qui relit
 * `myNetworkAdmin` d'elle-même et ferme alors toute l'application.
 */
export class SectionBoundary extends Component<{ children: ReactNode; fallback?: Fallback }, BoundaryState> {
  override state: BoundaryState = { caught: false, error: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { caught: true, error }
  }

  private readonly retry = () => this.setState((state) => ({ caught: false, error: null, attempt: state.attempt + 1 }))

  override render() {
    if (this.state.caught) {
      return this.props.fallback ? this.props.fallback(this.state.error, this.retry) : <SectionFailure error={this.state.error} retry={this.retry} />
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

/** Le refus ou la panne d'une lecture, dit en clair, et le geste pour relire. */
export function SectionFailure(props: { error: unknown; retry: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Card role="alert" className="flex min-w-0 flex-col items-start gap-3 p-4">
      <p className="text-sm">{engineErrorText(props.error, t, "section.failed")}</p>
      <Button variant="outline" size="sm" onClick={props.retry}>
        <RotateCwIcon aria-hidden="true" />
        {t("section.retry")}
      </Button>
    </Card>
  )
}
