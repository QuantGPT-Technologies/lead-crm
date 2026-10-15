import Image from "next/image";

export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      className="shrink-0 rounded-lg bg-white object-contain"
    />
  );
}
