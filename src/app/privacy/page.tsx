import { LegalSection, LegalShell } from "@/components/LegalShell";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy" updated="2026-10">
      <LegalSection title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address, used to sign you in and to decide whether you are on the pilot invite list.</li>
          <li>Your valuations: the business, your enterprise value estimate, your confidence choice, the time, and your optional private note.</li>
          <li>Your searches in Find deals, the filters we interpreted from them, and the number of results.</li>
          <li>Which listings were shown to you in Find deals and which listing URLs you revealed, with timestamps.</li>
          <li>Listing URLs you add, the neutral facts you enter, and a hash of the URL used to detect duplicates.</li>
          <li>A point ledger recording every change to your balance and why it happened.</li>
          <li>An optional buyer profile (states, industries, minimum earnings) if you choose to set one, used only to sort your Value queue.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          Valuations feed the buyers&apos; view statistics and the scoring that moves your balance. Exposure records (Find deals rows and reveals) enforce the rule that a
          member who has seen what buyers think of a business cannot submit a scored blind valuation of it. Search logs help us improve the search
          interpreter. Email domains group related accounts so that one firm counts as one independent voice in the statistics.
        </p>
      </LegalSection>

      <LegalSection title="What other members can see">
        <p>
          Never your identity, email, individual valuations, confidence choices or notes. Other members see aggregate statistics for a business together
          with the count of independent valuations. When the count is very small the aggregate is labelled as such, and you should assume a determined
          reader could infer roughly where one estimate lies when they know they are among very few contributors.
        </p>
        <p>
          A member who reveals a listing URL can tie the aggregate for that business to an identifiable company. The aggregate still never identifies who
          contributed.
        </p>
      </LegalSection>

      <LegalSection title="Skill percentile">
        <p>
          We compute a private, provisional skill percentile from your scored valuations. It is shown only to you, only once you have at least five scored
          valuations, and it is labelled as peer-predictive rather than verified accuracy. There is no leaderboard.
        </p>
      </LegalSection>

      <LegalSection title="Listing sources">
        <p>
          We fetch public broker listing pages that are not on our excluded list, store neutral facts rather than the publisher&apos;s text, and keep the
          original URL in a separate table that members cannot read directly. The URL is released only through the reveal flow. Publishers can ask for
          removal at any time and we take their listings down on complaint; where a source asks for attribution we show it.
        </p>
      </LegalSection>

      <LegalSection title="Storage, retention and access">
        <p>
          Data is stored in a managed Postgres database with row-level security; members can read only their own rows, and all writes go through
          audited server code. Administrators can see submissions, review queues and audit logs to run the pilot. We keep valuations and ledger rows for
          as long as the pilot runs because the statistics and scores are derived from them; if you ask us to delete your account we remove your
          identity and notes and keep only what is needed to preserve the integrity of other members&apos; scores.
        </p>
      </LegalSection>

      <LegalSection title="Third parties">
        <p>
          Sign-in email is delivered through our authentication provider. If an AI interpreter is enabled for search, the text of your search (and nothing
          about your identity) is sent to that provider to be turned into filters. We do not sell or share member data with brokers or listing sites.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>Reply to your invitation email with any question about your data, or to ask for an export or deletion.</p>
      </LegalSection>
    </LegalShell>
  );
}
