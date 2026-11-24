/**
 * Un clic simple — module PUR : bouton principal, sans touche de modification. Un lien dont la
 * page flottante intercepte le clic simple reste un vrai lien : Cmd-clic, Ctrl-clic, Maj-clic ou
 * le bouton du milieu ouvrent son adresse comme le navigateur le fait.
 */
export function isPlainClick(event: { readonly button: number; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
