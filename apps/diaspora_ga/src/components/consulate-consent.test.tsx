// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { keepConsent } from "@/lib/consulate-consent"
import { ConsulateConsent } from "./consulate-consent"

const mocks = vi.hoisted(() => ({ join: vi.fn(), replace: vi.fn(), authUser: "same" }))
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ data:{ user: { id:mocks.authUser } }, isPending:false }) } }))
vi.mock("@diaspora-ga/features/i18n/client", () => ({ useDiasporaGaT: () => ({ t:(key:string) => key }) }))
vi.mock("@diaspora-ga/features", () => ({
  Button: ({ children,onClick,disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  CountrySwitch: ({value}:{value:string}) => <span>{value}</span>,
}))
vi.mock("@diaspora-ga/features/data", () => ({
  useSession: () => ({ status:"ready", data:{ status:"signed_in", account:{id:"person", idn:{loa:2}, nameHints:{}}, membership:null } }),
  useDataSource: () => ({ profilePublication:{useMyProfile:()=>({status:"ready",data:null})}, entryPrefill:{useEntryPrefill:()=>({status:"ready",data:null})} }),
  useHandleSuggestions:()=>["anonyme"], useActions:()=>({join:mocks.join}), useOpenCountries:()=>({status:"ready",data:[]}),
}))
vi.mock("./consulate-transition",()=>({ConsulateTransition:()=><p>DIASPORA.GA</p>}))
beforeEach(() => {
  vi.clearAllMocks(); mocks.authUser="same"; sessionStorage.clear()
  vi.stubGlobal("location", {replace:mocks.replace})
  keepConsent({ok:true,next:"consent",userId:"same",givenNames:"Lise Anne",familyName:"MBA",countryOfResidence:"FR"},sessionStorage)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it("présente l'identité du compte sans formulaire et attend le geste d’adhésion", async () => {
  mocks.join.mockResolvedValue({ok:true})
  render(<ConsulateConsent idnOnly={false}/>)
  expect(await screen.findByText("Lise Anne MBA")).toBeInTheDocument()
  expect(screen.queryByRole("textbox")).toBeNull()
  expect(mocks.join).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button",{name:"consulateGateway.passage.accept"}))
  await waitFor(()=>expect(mocks.replace).toHaveBeenCalledWith("/fil"))
  expect(mocks.join).toHaveBeenCalledWith({facet:{countryOfResidence:"FR"},displayName:"Lise Anne MBA",handle:"anonyme",consents:{social_profile:true,directory:true,notifications:false},directoryVisibility:"network",guestProfile:true})
})
it("refuse le rappel d'un autre utilisateur sans afficher ses noms ni permettre l’adhésion", async () => {
  mocks.authUser="other"
  render(<ConsulateConsent idnOnly={false}/>)
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.queryByText(/Lise Anne/)).toBeNull()
  expect(mocks.join).not.toHaveBeenCalled()
})
