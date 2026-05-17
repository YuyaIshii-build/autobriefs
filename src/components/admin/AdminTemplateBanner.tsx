/**
 * /prompt-pipelines 配下の管理者向け画面で共通表示する案内。
 */
export default function AdminTemplateBanner() {
  return (
    <div className="mb-6 rounded-lg border border-slate-600/30 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-sm">
      <p className="font-semibold tracking-wide text-slate-50">管理者向け · Template 管理（内部運用）</p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
        登録済みテンプレートとプロンプト手順のメンテナンス用です。一般利用者向けの操作はホームの「Brief を作成」から行ってください。
      </p>
    </div>
  );
}
