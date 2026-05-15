import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Road Runner — Schedule once. Run everywhere.";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 30%, rgba(204,255,0,0.10), transparent 50%), #08090a",
          color: "#fafafa",
          fontFamily: "Geist, system-ui",
          position: "relative",
        }}
      >
        {/* Grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(38,41,46,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(38,41,46,0.6) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            opacity: 0.5,
          }}
        />
        {/* Mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 36,
          }}
        >
          <svg width="84" height="84" viewBox="0 0 96 96">
            <rect x="1" y="1" width="94" height="94" rx="22" fill="#0F1014" stroke="rgba(255,255,255,0.06)" />
            <path d="M27 69 L40.5 27 H48 L34.5 69 Z" fill="#CCFF00" />
            <path d="M49 69 L62.5 27 H70 L56.5 69 Z" fill="#CCFF00" />
          </svg>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2 }}>Road Runner</span>
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -3,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          Schedule <span style={{ color: "#ccff00" }}>once</span>.
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -3,
            textAlign: "center",
            lineHeight: 1.05,
            marginTop: 8,
          }}
        >
          Run everywhere.
        </div>
        <div
          style={{
            marginTop: 44,
            fontSize: 28,
            color: "#9ca0a8",
            textAlign: "center",
          }}
        >
          One short. Five platforms. Five times.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
