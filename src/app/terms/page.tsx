import { LegalSection, LegalShell } from "@/components/LegalShell";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of use" updated="2026-10">
      <LegalSection title="What PriceAFirm is">
        <p>
          PriceAFirm collects independent valuations of businesses that are already listed for sale on sources that have cleared a rights review. We pool
          those valuations into model-derived crowd statistics and let members spend points to reveal the original listing URLs.
        </p>
        <p>
          PriceAFirm is a research and discovery tool. It is not a broker, an appraiser, an investment adviser or a marketplace. Nothing on the site is an
          offer to buy or sell a business, a bid, or a verified price.
        </p>
      </LegalSection>

      <LegalSection title="Your contributions">
        <p>When you value a business you confirm, each time, that:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the estimate is your own independent judgment, not copied from another person or coordinated with other accounts;</li>
          <li>you used only the listing facts shown and information you are authorized to use;</li>
          <li>you did not use or disclose information covered by a non-disclosure agreement or other confidentiality duty;</li>
          <li>you are not uploading documents, and your optional note contains no confidential or NDA-restricted information.</li>
        </ul>
        <p>
          When you add a listing URL you confirm that it is a public page on a source you are allowed to share, and that the facts you enter are a fair
          summary of what the page states. We never fetch pages from blocked sources, and we do not store the broker&apos;s wording.
        </p>
      </LegalSection>

      <LegalSection title="Points">
        <p>
          Points are an internal measure of contribution. They are not money, have no cash value, cannot be bought, sold, transferred or redeemed, and may
          be adjusted or reset during the pilot. New accounts start with 3 points.
        </p>
        <p>
          A valuation earns a score that moves as later independent valuations of the same business arrive. The score measures how well your estimate
          anticipated later opinions, which is a peer-predictive signal and not verified accuracy. Scores and the resulting point balance can go up or
          down, and your balance can become negative. Each valuation has a frozen maximum gain and maximum loss shown before you submit.
        </p>
        <p>
          Revealing an original listing URL costs exactly 1 point once per business. Re-opening a URL you already revealed is free, and revealing a URL you
          submitted yourself is free. Already-revealed URLs stay available even if your balance later falls below zero; new reveals need a balance of at
          least 1.
        </p>
      </LegalSection>

      <LegalSection title="Previews and eligibility">
        <p>
          Previewing an opportunity in Find Deals shows you crowd-derived value information for that business. Once you have seen it you can no longer
          submit a scored blind valuation of that business. Previews cost nothing and this effect is permanent; the preview button says so before you
          click.
        </p>
      </LegalSection>

      <LegalSection title="What we show to others">
        <p>
          Your individual valuations, confidence choices, notes and identity are never shown to other members. Other members see only aggregate statistics
          (such as a median and a spread) together with the number of independent valuations that contributed. Once a member reveals a listing URL, the
          aggregate for that business is tied to an identifiable company for that member.
        </p>
      </LegalSection>

      <LegalSection title="No promises">
        <p>
          Crowd statistics are model outputs built from a small number of opinions and documented conventions. They can be wrong, thin or stale. We make
          no promise about the accuracy of any figure, the availability of any listing, the behaviour of any source site, or the future value of points.
          Use your own diligence before acting on anything you see here.
        </p>
      </LegalSection>

      <LegalSection title="Accounts and conduct">
        <p>
          Access is by invitation during the pilot. Keep your sign-in link private. We may suspend or freeze accounts that submit coordinated or
          copied valuations, scrape the service, probe other members&apos; data, or submit URLs from sources that have not cleared review. Frozen accounts
          cannot submit new valuations.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may change these terms as the pilot evolves. When a change affects contributions we will ask you to acknowledge the new version before your
          next valuation or URL submission.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
