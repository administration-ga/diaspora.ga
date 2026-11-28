import { GuestEntry } from "@/components/guest-reader"
import { LandingScreen } from "@/screens/landing-screen"

export default function HomePage() {
  return <GuestEntry screen="feed"><LandingScreen /></GuestEntry>
}
