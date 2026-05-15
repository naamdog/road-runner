import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Road Runner.",
};

export default function TermsPage() {
  return (
    <article className="container-page max-w-3xl py-16">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Last updated: {new Date().toLocaleDateString("en", { dateStyle: "long" })}
      </p>

      <section className="mt-8 space-y-6 text-foreground/90 leading-relaxed">
        <Block title="Accepting these terms">
          <p>
            By creating a Road Runner account, you agree to these terms and our
            Privacy Policy. If you're using Road Runner on behalf of an
            organization, you agree to these terms on its behalf.
          </p>
        </Block>

        <Block title="Your account">
          <p>
            You're responsible for keeping your password secure and for
            everything that happens under your account. Don't share your
            credentials. If you suspect unauthorized access, change your
            password and contact us.
          </p>
        </Block>

        <Block title="Your content">
          <p>
            You retain all rights to the videos and captions you upload. By
            scheduling a post, you grant Road Runner permission to publish that
            content to the platforms you've connected, on your behalf, at the
            times you scheduled.
          </p>
        </Block>

        <Block title="Acceptable use">
          <p>
            Don't use Road Runner to publish content that's illegal, harmful,
            harassing, infringes others' rights, or violates the terms of the
            platforms we publish to (YouTube, Instagram, TikTok, LinkedIn,
            Facebook). We may suspend accounts that do.
          </p>
        </Block>

        <Block title="Platform limits">
          <p>
            Each platform has its own publishing rules and rate limits. Road
            Runner attempts to pre-flight your content against them, but we
            can't guarantee a post will succeed — for example, if a platform
            rejects it for community-guidelines reasons. We'll surface the
            error and retry where reasonable.
          </p>
        </Block>

        <Block title="Service availability">
          <p>
            Road Runner is provided as-is. We aim for high availability but
            don't guarantee uptime or that a scheduled post will publish at the
            exact second you requested.
          </p>
        </Block>

        <Block title="Termination">
          <p>
            You can delete your account at any time from Settings. We can
            suspend or terminate access for violations of these terms.
          </p>
        </Block>

        <Block title="Liability">
          <p>
            To the maximum extent permitted by law, Road Runner is not liable
            for any indirect, incidental, or consequential damages. Our total
            liability won't exceed the fees you paid us in the 12 months prior.
          </p>
        </Block>

        <Block title="Changes">
          <p>
            We may update these terms; we'll notify you of material changes by
            email or in-app. Continued use means you accept the updated terms.
          </p>
        </Block>
      </section>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-muted-foreground">{children}</div>
    </div>
  );
}
