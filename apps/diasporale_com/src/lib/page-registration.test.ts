import { describe, expect, it } from "vitest"

import {
  firstRegistrationStep,
  nearbyNameQuery,
  nearbyPageClaimable,
  NEARBY_NAME_MIN_LENGTH,
  nextRegistrationStep,
  previousRegistrationStep,
  REGISTRATION_NATURE_OFFERS,
  REGISTRATION_STEP_FIELDS,
  REGISTRATION_STEPS,
  registrationFieldOfRefusal,
  registrationNextSteps,
  registrationStepOf,
} from "./page-registration"
import { routes } from "./routes"

describe("inscription d'une organisation — les étapes (AS-05)", () => {
  it("trois étapes, dans l'ordre : nature, identité, récapitulatif", () => {
    expect(REGISTRATION_STEPS).toEqual(["nature", "identity", "review"])
    expect(nextRegistrationStep("nature")).toBe("identity")
    expect(nextRegistrationStep("identity")).toBe("review")
    expect(nextRegistrationStep("review")).toBeNull()
    expect(previousRegistrationStep("review")).toBe("identity")
    expect(previousRegistrationStep("identity")).toBe("nature")
    expect(previousRegistrationStep("nature")).toBeNull()
  })

  it("une nature choisie dans l'adresse ouvre l'identité ; sinon, la nature d'abord", () => {
    expect(firstRegistrationStep(null)).toBe("nature")
    expect(firstRegistrationStep("company")).toBe("identity")
    expect(firstRegistrationStep("association")).toBe("identity")
  })

  it("chaque champ relève d'une seule étape ; un refus à l'envoi y ramène", () => {
    const fields = REGISTRATION_STEPS.flatMap((step) => REGISTRATION_STEP_FIELDS[step])
    expect(new Set(fields).size).toBe(fields.length)
    expect(registrationStepOf("ownerKind")).toBe("nature")
    expect(registrationStepOf("name")).toBe("identity")
    expect(registrationStepOf("sector")).toBe("identity")
    expect(REGISTRATION_STEP_FIELDS.review).toEqual([])
  })

  it("un refus du serveur désigne son champ ; un refus sans champ reste au récapitulatif", () => {
    expect(registrationFieldOfRefusal("page_handle_taken")).toBe("handle")
    expect(registrationFieldOfRefusal("page_handle_length")).toBe("handle")
    expect(registrationFieldOfRefusal("page_name_invalid")).toBe("name")
    expect(registrationFieldOfRefusal("page_short_name_too_long")).toBe("shortName")
    expect(registrationFieldOfRefusal("page_association_type_invalid")).toBe("associationType")
    expect(registrationFieldOfRefusal("page_sector_invalid")).toBe("sector")
    expect(registrationFieldOfRefusal("page_country_invalid")).toBe("country")
    expect(registrationFieldOfRefusal("page_kind_reserved")).toBe("ownerKind")
    expect(registrationStepOf(registrationFieldOfRefusal("page_kind_reserved")!)).toBe("nature")
    expect(registrationFieldOfRefusal("page_verified_required")).toBeNull()
    expect(registrationFieldOfRefusal("rate_limited")).toBeNull()
    expect(registrationFieldOfRefusal("unknown")).toBeNull()
  })

  it("seules l'association et l'entreprise disent ce qu'elles ouvrent", () => {
    expect(Object.keys(REGISTRATION_NATURE_OFFERS).sort()).toEqual(["association", "company"])
  })
})

describe("inscription d'une organisation — les pages au nom proche", () => {
  it("ne cherche qu'à partir d'un nom assez long, espaces resserrés", () => {
    expect(nearbyNameQuery("ab")).toBeNull()
    // Les espaces ne comptent pas : « a b » n'a que deux signes.
    expect(nearbyNameQuery("  a  b ")).toBeNull()
    expect(nearbyNameQuery("a b c")).toBe("a b c")
    expect(nearbyNameQuery("x".repeat(NEARBY_NAME_MIN_LENGTH))).toBe("xxx")
    expect(nearbyNameQuery("  Association   des Gabonais  de Lyon ")).toBe("Association des Gabonais de Lyon")
    expect(nearbyNameQuery("a".repeat(300))).toHaveLength(120)
  })

  it("propose la revendication d'une page sans badge, jamais d'une page vérifiée ni d'une institution", () => {
    expect(nearbyPageClaimable({ badge: "community", ownerKind: "association" })).toBe(true)
    expect(nearbyPageClaimable({ badge: "verified", ownerKind: "association" })).toBe(false)
    expect(nearbyPageClaimable({ badge: "official", ownerKind: "institution" })).toBe(false)
    expect(nearbyPageClaimable({ badge: "community", ownerKind: "institution" })).toBe(false)
  })
})

describe("inscription d'une organisation — les premiers gestes", () => {
  const ALL = { jobs: true, services: true, members: true }
  const NONE = { jobs: false, services: false, members: false }

  it("une entreprise : identité, vérification, équipe, emploi, services, publication", () => {
    const steps = registrationNextSteps({ handle: "saveurs-de-lille", ownerKind: "company" }, ALL)
    expect(steps.map((step) => step.id)).toEqual(["identity", "verification", "team", "jobs", "services", "publication"])
    expect(steps.find((step) => step.id === "verification")?.href).toBe(routes.pageClaim("saveurs-de-lille"))
    expect(steps.find((step) => step.id === "jobs")?.href).toBe(routes.pageManage("saveurs-de-lille", "emplois"))
    expect(steps.find((step) => step.id === "services")?.href).toBe(routes.pageManage("saveurs-de-lille", "services"))
  })

  it("une association : ses adhérents d'abord, puis l'emploi et les services", () => {
    const steps = registrationNextSteps({ handle: "amicale-lyon", ownerKind: "association" }, ALL)
    expect(steps.map((step) => step.id)).toEqual(["identity", "verification", "team", "members", "jobs", "services", "publication"])
    expect(steps.find((step) => step.id === "members")?.href).toBe(routes.associationMembers("amicale-lyon"))
  })

  it("aucun geste ne mène à une capacité que le fournisseur ne sert pas", () => {
    expect(registrationNextSteps({ handle: "amicale-lyon", ownerKind: "association" }, NONE).map((step) => step.id)).toEqual(["identity", "verification", "team", "publication"])
    expect(registrationNextSteps({ handle: "saveurs", ownerKind: "company" }, { ...NONE, services: true }).map((step) => step.id)).toEqual(["identity", "verification", "team", "services", "publication"])
  })

  it("chaque geste porte son titre et son aide, en clés de la locale", () => {
    for (const step of registrationNextSteps({ handle: "p", ownerKind: "association" }, ALL)) {
      expect(step.titleKey).toBe(`pageAdmin.register.done.${step.id}.title`)
      expect(step.hintKey).toBe(`pageAdmin.register.done.${step.id}.hint`)
    }
  })
})
