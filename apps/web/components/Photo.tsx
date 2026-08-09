export default function Photo({
  src,
  alt,
  caption,
  ratio = "wide",
  frame = false,
  className = "",
  fit = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  ratio?: "portrait" | "tall" | "wide" | "square";
  frame?: boolean;
  className?: string;
  fit?: boolean;
}) {
  return (
    <div className={`mkt-photo mkt-photo--${ratio}${frame ? " mkt-photo-frame-ink" : ""} ${fit ? " mkt-photo--fit" : ""} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      {caption && <span className="mkt-photo-caption">{caption}</span>}
    </div>
  );
}
