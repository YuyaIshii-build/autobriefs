/** AutoBriefs ブランドカラー */
export const BRAND_PRIMARY = '#bc002c';
export const BRAND_PRIMARY_HOVER = '#9f0025';
export const BRAND_PRIMARY_MUTED = 'rgba(188, 0, 44, 0.12)';
export const BRAND_PRIMARY_RING = 'rgba(188, 0, 44, 0.28)';

/** Primary CTA（ボタン・重要リンク） */
export const btnPrimaryClass =
  'inline-flex items-center justify-center rounded-lg bg-[#bc002c] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#9f0025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(188,0,44,0.28)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** フォーム送信など幅広ボタン */
export const btnPrimaryBlockClass = `${btnPrimaryClass} w-full sm:w-auto`;

/** ヘッダーナビ — 非アクティブ */
export const navLinkInactiveClass =
  'rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900';

/** ヘッダーナビ — アクティブ */
export const navLinkActiveClass =
  'rounded-md bg-[rgba(188,0,44,0.12)] px-3 py-2 text-sm font-medium text-[#bc002c] transition-colors hover:bg-[rgba(188,0,44,0.16)]';

export function navLinkClass(active: boolean) {
  return active ? navLinkActiveClass : navLinkInactiveClass;
}

/** テキストCTA */
export const linkPrimaryClass =
  'font-medium text-[#bc002c] underline-offset-2 transition-colors hover:text-[#9f0025] hover:underline';
