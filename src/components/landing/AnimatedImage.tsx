import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export type AnimationKind = "fade-up" | "parallax" | "ken-burns" | "zoom-hover";

interface AnimatedImageProps {
  src: string;
  alt: string;
  animation?: AnimationKind;
  className?: string;
  ringClassName?: string;
}

/**
 * Drop-in wrapper that gives any uploaded landing image a tasteful entrance
 * animation, consistent framing (16:10), rounded corners and brand shadow.
 */
export const AnimatedImage = ({
  src,
  alt,
  animation = "fade-up",
  className,
  ringClassName = "ring-white/10",
}: AnimatedImageProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  // Use a generous frame and `object-contain` so the WHOLE uploaded image is
  // always visible (vertical phone screenshots, square diagrams, wide flows).
  const wrapper = cn(
    "relative aspect-[16/10] w-full overflow-hidden rounded-2xl ring-1 shadow-elegant bg-black/60 backdrop-blur-sm",
    ringClassName,
    className,
  );
  const imgClass = "absolute inset-0 h-full w-full object-contain";

  if (animation === "parallax") {
    return (
      <div ref={ref} className={wrapper}>
        <motion.img src={src} alt={alt} loading="lazy" style={{ y }} className={imgClass} />
      </div>
    );
  }

  if (animation === "ken-burns") {
    return (
      <div ref={ref} className={wrapper}>
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          initial={{ scale: 1.04 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 8, ease: "easeOut" }}
          className={imgClass}
        />
      </div>
    );
  }

  if (animation === "zoom-hover") {
    return (
      <div ref={ref} className={cn(wrapper, "group")}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cn(imgClass, "transition-transform duration-[700ms] ease-out group-hover:scale-[1.04]")}
        />
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={wrapper}
    >
      <img src={src} alt={alt} loading="lazy" className={imgClass} />
    </motion.div>
  );
};
