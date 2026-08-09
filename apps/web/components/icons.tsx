import type { CSSProperties, ReactNode } from "react";

type IconProps = { size?: number; className?: string; style?: CSSProperties };

function base(props: IconProps, children: ReactNode, sw = 1.6) {
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      style={props.style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => base(p, <path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowLeft = (p: IconProps) => base(p, <path d="M19 12H5M11 6l-6 6 6 6" />);
export const ArrowUpRight = (p: IconProps) => base(p, <path d="M7 17L17 7M8 7h9v9" />);
export const Check = (p: IconProps) => base(p, <path d="M5 13l4 4L19 7" />);
export const Pin = (p: IconProps) => base(p, <><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="10" r="2.4" /></>);
export const Phone = (p: IconProps) => base(p, <path d="M5 4h4l1.5 4.5-2.2 1.6a13 13 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.6 1.6 0 0 1-1.7 1.6A16.5 16.5 0 0 1 3.4 5.7 1.6 1.6 0 0 1 5 4Z" />);
export const Mail = (p: IconProps) => base(p, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>);
export const Clock = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>);
export const Cap = (p: IconProps) => base(p, <><path d="M2 9l10-5 10 5-10 5L2 9Z" /><path d="M6 11.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3v-3.5M22 9v5" /></>);
export const Beaker = (p: IconProps) => base(p, <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /><path d="M8 14h8" /></>);
export const Book = (p: IconProps) => base(p, <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17.5H6.5A2.5 2.5 0 0 0 4 23V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17.5h4.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z" /></>);
export const Globe = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" /></>);
export const Home = (p: IconProps) => base(p, <><path d="M3 11l9-7.5L21 11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z" /><path d="M9.5 21v-6h5v6" /></>);
export const Bus = (p: IconProps) => base(p, <><path d="M4 7h11v8H4zM15 7h4v8h-4zM6 12h7M6 15h7" /><circle cx="7.5" cy="17.5" r="1.6" /><circle cx="15.5" cy="17.5" r="1.6" /><path d="M9 4.5h7" /></>);
export const Monitor = (p: IconProps) => base(p, <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>);
export const Heart = (p: IconProps) => base(p, <path d="M12 20s-7-4.4-9-9.2C1.5 7 4 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4 20 4 22.5 7 21 10.8 19 15.6 12 20 12 20Z" />);
export const Spark = (p: IconProps) => base(p, <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.9 2.6L22.5 19.5l-2.6.9L19 23l-.9-2.6-2.6-.9 2.6-.9L19 16Z" />);
export const Target = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>);
export const Shield = (p: IconProps) => base(p, <><path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>);
export const Trophy = (p: IconProps) => base(p, <><path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5a0 0 0 0 0 0v1a4 4 0 0 0 4 4M16 5h3v1a4 4 0 0 1-4 4M12 14v3M8 20h8M9 20h6v-3H9v3Z" /></>);
export const Users = (p: IconProps) => base(p, <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3.2 2.5-5 5.5-5s5.5 1.8 5.5 5" /><path d="M15 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.2c1.9.8 3 2.4 3 4.8" /></>);
export const Quote = (p: IconProps) => base(p, <path d="M7.5 5C5 6.6 3.5 9 3.5 12c0 3 1.6 5 4 5 1.9 0 3.3-1.4 3.3-3.3 0-1.8-1.3-3.1-3-3.1-.3 0-.7 0-.9.1.4-1.9 2-3.6 4-4.4L7.5 5Zm9 0c-2.5 1.6-4 4-4 7 0 3 1.6 5 4 5 1.9 0 3.3-1.4 3.3-3.3 0-1.8-1.3-3.1-3-3.1-.3 0-.7 0-.9.1.4-1.9 2-3.6 4-4.4L16.5 5Z" />);
export const Ruler = (p: IconProps) => base(p, <><rect x="3" y="9" width="18" height="6" rx="1.5" transform="rotate(-8 12 12)" /><path d="M7 13l1-1M11 12l1-1M15 11l1-1" /></>);
export const Leaf = (p: IconProps) => base(p, <><path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z" /><path d="M4 20c3-6 8-10 12-12" /></>);
export const Menu = (p: IconProps) => base(p, <><path d="M4 7h16M4 12h16M4 17h10" /></>);
export const Close = (p: IconProps) => base(p, <><path d="M6 6l12 12M18 6L6 18" /></>);
export const Play = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.18" /><path d="M10 9l6 3-6 3V9Z" /></>);
