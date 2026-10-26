import { Gateway } from "../components/Gateway";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Gateway siteName={process.env.SITE_NAME || "DND Battle Room"} />;
}
