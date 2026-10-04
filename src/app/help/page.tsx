import { TopBar } from "@/components/ui";
import { LADY_BAY_BONUS, NO_SHOW_PROVIDER_SHARE, PENALTY, PLATFORM_FEE, PROVIDER_EARNING } from "@/lib/pricing";

const FAQ: [string, string][] = [
  [
    "How does ParkSwap work?",
    "Drivers about to leave post their spot. A driver looking for parking grabs it and pays in the app. The provider waits until the seeker arrives, pulls out, and the seeker pulls in.",
  ],
  [
    "Is my money safe?",
    "Your payment is held by ParkSwap and only released to the provider after you tap “Complete parking”. If the provider doesn't leave, cancels, or you report a problem, you get a full refund to your wallet.",
  ],
  [
    "How much can I earn?",
    `Providers earn ฿${PROVIDER_EARNING.Low}–${PROVIDER_EARNING.High} depending on demand, plus ฿${LADY_BAY_BONUS} for a lady parking bay. Seekers pay the provider's earnings plus a ฿${PLATFORM_FEE} service fee.`,
  ],
  [
    "What if someone is late?",
    `If a seeker doesn't arrive by the leave time they pay a ฿${PENALTY} penalty (฿${NO_SHOW_PROVIDER_SHARE} goes to the provider for waiting). If a provider doesn't leave or cancels after a match, they pay ฿${PENALTY} and the seeker is refunded.`,
  ],
  ["Can I cancel?", `Free while we're still looking for a driver. After a driver is matched, cancelling costs ฿${PENALTY}.`],
  [
    "Do I need an account?",
    "No — you can browse, grab and offer spots as a guest. Log in with your phone number to save your car and payment info, and to withdraw earnings to your bank.",
  ],
  [
    "Why no map?",
    "GPS is unreliable inside multi-storey car parks, so spots are described by building, floor, zone, entrance, landmark and the provider's car.",
  ],
];

export default function HelpPage() {
  return (
    <div className="screen">
      <TopBar title="Help" back={true} help={false} />
      <div className="body">
        <h2 className="h-title">How ParkSwap works</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="card collapsible">
            <summary>{q}</summary>
            <p className="muted mt-2 leading-[1.5]">{a}</p>
          </details>
        ))}
        <p className="small faint center">Need help with a live handover? Use “Having problems?” on the parking screen.</p>
      </div>
    </div>
  );
}
