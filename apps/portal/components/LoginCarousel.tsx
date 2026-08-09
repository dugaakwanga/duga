"use client";

import { useEffect, useRef, useState } from "react";

interface CarouselItem {
  type: "video" | "image";
  src: string;
}

const CAROUSEL_DATA: Record<string, CarouselItem[]> = {
  PRIMARY: [
    { type: "video", src: "/videos/pupils group video.mp4" },
    { type: "image", src: "/images/group pupils.png" },
    { type: "image", src: "/images/pupil hands up.png" },
    { type: "image", src: "/images/single pupil.png" },
    { type: "image", src: "/images/primarypupil.png" },
  ],
  SECONDARY: [
    { type: "video", src: "/videos/sec video.mp4" },
    { type: "image", src: "/images/sec group 2.png" },
    { type: "image", src: "/images/sec reading.png" },
    { type: "image", src: "/images/group 1 sec.png" },
    { type: "image", src: "/images/single sec boy.png" },
    { type: "image", src: "/images/single sec girl.png" },
  ],
  PARENT: [
    { type: "image", src: "/images/parent.jpg" },
    { type: "image", src: "/images/parent.png" },
  ],
  TEACHER: [
    { type: "image", src: "/images/teacher.jpg" },
    { type: "image", src: "/images/teacher.png" },
  ],
  ADMIN: [
    { type: "image", src: "/images/logo.png" },
  ],
};

interface LoginCarouselProps {
  type: "PRIMARY" | "SECONDARY" | "PARENT" | "TEACHER" | "ADMIN";
}

export default function LoginCarousel({ type }: LoginCarouselProps) {
  const items = CAROUSEL_DATA[type] || [];
  const [active, setActive] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset active state when type changes
  useEffect(() => {
    setActive(0);
  }, [type]);

  // Handle active video playback
  useEffect(() => {
    videoRefs.current.forEach((v, idx) => {
      if (!v) return;
      if (items[idx]?.type === "video" && idx === active) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active, items]);

  // Cycle slides if there is more than 1 item
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (items.length <= 1) return;

    intervalRef.current = setInterval(() => {
      setActive((a) => (a + 1) % items.length);
    }, 6000); // 6 seconds per slide for login panel to keep it lively but readable

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="login-carousel-container">
      {items.map((item, idx) => {
        const isActive = idx === active;
        const isLogo = type === "ADMIN" || item.src.includes("logo.png");

        if (item.type === "video") {
          return (
            <video
              key={item.src}
              ref={(el) => {
                videoRefs.current[idx] = el;
              }}
              src={item.src}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className={`login-carousel-media ${isActive ? "active" : ""} ${isLogo ? "is-logo" : ""}`}
            />
          );
        }

        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.src}
            src={item.src}
            alt=""
            className={`login-carousel-media ${isActive ? "active" : ""} ${isLogo ? "is-logo" : ""}`}
          />
        );
      })}
    </div>
  );
}