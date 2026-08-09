export default function WaveDivider({
  flip = false,
  tone = "surface",
}: {
  flip?: boolean;
  tone?: "surface" | "navy" | "paper" | "white";
}) {
  const cls = `mkt-wave${flip ? " mkt-wave--flip" : ""}${
    tone === "navy" ? " mkt-wave--navy" : tone === "paper" ? " mkt-wave--paper" : tone === "white" ? " mkt-wave--white" : " mkt-wave--surface"
  }`;
  return (
    <div className={cls} aria-hidden="true">
      <svg viewBox="0 0 1440 70" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,38 C240,70 480,70 720,44 C960,18 1200,8 1440,30 L1440,70 L0,70 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
