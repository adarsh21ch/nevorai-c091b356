import { ProblemSolutionSection } from "./ProblemSolutionSection";
import skipImg from "@/assets/landing/section-2-skip-button.jpg";
import noSkipImg from "@/assets/landing/section-3-no-skip.jpg";
import unknownImg from "@/assets/landing/section-4-unknown-viewers.jpg";
import realtimeImg from "@/assets/landing/section-5-realtime-activity.jpg";
import clutterImg from "@/assets/landing/section-6-youtube-clutter.jpg";
import cleanImg from "@/assets/landing/section-7-clean-player.jpg";

export const StorySections = () => (
  <>
    <ProblemSolutionSection
      tone="problem"
      imagePosition="right"
      eyebrow="The Problem"
      headline={
        <>
          Your prospects skip your video <br />
          <span className="text-destructive">in the first 30 seconds.</span>
        </>
      }
      subheading="On YouTube, Loom, Vimeo — the skip button is always there."
      image={skipImg}
      imageAlt="Cursor about to click a red SKIP button on a video player"
    />

    <ProblemSolutionSection
      tone="solution-green"
      imagePosition="left"
      eyebrow="The Fix"
      headline={
        <>
          With Nevorai, they watch <br />
          <span className="text-brand-emerald">the entire thing.</span>
        </>
      }
      subheading="No skip button. No distractions. Just your message, start to finish."
      metric="91% of viewers watch to the end"
      image={noSkipImg}
      imageAlt="Clean video player with full green progress bar and checkmark"
    />

    <ProblemSolutionSection
      tone="problem"
      imagePosition="right"
      eyebrow="The Problem"
      headline={
        <>
          You share a video. Then you wonder:{" "}
          <span className="text-destructive">did they watch?</span>
        </>
      }
      subheading="YouTube doesn't tell you who opened your link, or how far they got."
      image={unknownImg}
      imageAlt="Confused creator staring at a blank analytics dashboard"
    />

    <ProblemSolutionSection
      tone="solution-blue"
      imagePosition="left"
      eyebrow="The Fix"
      headline={
        <>
          See who watched in real-time. <br />
          <span className="text-brand-blue">Even mid-meeting.</span>
        </>
      }
      subheading="Know exactly who opened your link, from where, on which device — and how much they watched."
      metric="Live activity updates as they watch"
      image={realtimeImg}
      imageAlt="Real-time viewer activity dashboard with live indicator"
    />

    <ProblemSolutionSection
      tone="problem"
      imagePosition="right"
      eyebrow="The Problem"
      headline={
        <>
          While they're watching your pitch,{" "}
          <span className="text-destructive">YouTube recommends cat videos.</span>
        </>
      }
      subheading="Suggested videos, comments, autoplay — prospects leave mid-message."
      image={clutterImg}
      imageAlt="Cluttered YouTube interface with many recommended videos"
    />

    <ProblemSolutionSection
      tone="solution-green"
      imagePosition="left"
      eyebrow="The Fix"
      headline={
        <>
          Your video. Nothing else. <br />
          <span className="text-brand-emerald">No escape routes.</span>
        </>
      }
      subheading="Clean player. No suggestions. No comments. Just your message, full-screen ready."
      metric="Full attention. Zero leakage."
      image={cleanImg}
      imageAlt="Minimal full-screen video player with no distractions"
    />
  </>
);
