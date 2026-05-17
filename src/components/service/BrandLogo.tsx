import Link from 'next/link';

type Props = {
  showWordmark?: boolean;
  className?: string;
};

/** ファビコン（/favicon.ico）と AutoBriefs ワードマーク — 静的 img で webpack チャンク競合を避ける */
export default function BrandLogo({ showWordmark = true, className = '' }: Props) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-3 ${className}`.trim()}
      aria-label="AutoBriefs ホーム"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/favicon.ico"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-lg"
        decoding="async"
      />
      {showWordmark ? (
        <span className="text-base font-semibold tracking-tight text-[#bc002c]">AutoBriefs</span>
      ) : null}
    </Link>
  );
}
