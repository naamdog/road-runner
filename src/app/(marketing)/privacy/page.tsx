import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Road Runner handles your data.",
};

export default function PrivacyPage() {
  return (
    <article className="container-page max-w-3xl py-16 prose-content">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Last updated: {new Date().toLocaleDateString("en", { dateStyle: "long" })}
      </p>

      <section className="mt-8 space-y-6 text-foreground/90 leading-relaxed">
        <Block title="The short version">
          <p>
            We collect the bare minimum to run Road Runner: your email and
            password (hashed), the videos and captions you upload, and the
            access tokens you grant us when you connect a social platform. We
            never sell your data, never read your audience data, and never use
            your content to train AI.
          </p>
        </Block>

        <Block title="What we collect">
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account:</strong> name, email, and a hashed password.
            </li>
            <li>
              <strong>Content:</strong> the video files you upload and the
              captions you write.
            </li>
            <li>
              <strong>OAuth tokens:</strong> access + refresh tokens issued by
              YouTube, Instagram, TikTok, LinkedIn, and Facebook when you
              connect.
            </li>
            <li>
              <strong>Telemetry:</strong> request logs (IP, user agent) for
              security and rate limiting.
            </li>
          </ul>
        </Block>

        <Block title="What we don't collect">
          <ul className="list-disc pl-6 space-y-1">
            <li>Your audience, followers, or engagement data.</li>
            <li>DMs, comments, or any other content you didn't upload.</li>
            <li>Cross-site tracking or advertising cookies.</li>
          </ul>
        </Block>

        <Block title="How we use it">
          <p>
            Strictly to provide the service: publish your videos at the times
            you scheduled, render the dashboard, and let you sign in. That's
            it.
          </p>
        </Block>

        <Block title="Where it lives">
          <p>
            Application data is stored in Postgres. Video files are stored as
            Vercel Blob objects. All data is encrypted in transit and at rest.
          </p>
        </Block>

        <Block title="Your rights">
          <p>
            You can disconnect any platform, delete any scheduled post, and
            delete your entire account from Settings — including all videos,
            captions, and tokens — at any time.
          </p>
        </Block>

        <Block title="Questions">
          <p>
            Email <a className="text-brand hover:underline underline-offset-4" href="mailto:hello@road-runner.app">hello@road-runner.app</a>.
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
