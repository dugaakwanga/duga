export default function Loading() {
  return (
    <div className="duga-global-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="duga-global-loader__box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <video src="/videos/animate_school_crest_logo.mp4" autoPlay muted loop playsInline aria-hidden="true" />
        <span className="duga-global-loader__label">Loading</span>
      </div>
    </div>
  );
}