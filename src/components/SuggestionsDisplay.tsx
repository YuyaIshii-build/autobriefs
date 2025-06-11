'use client';

type Props = {
  titles: string[];
  descriptions: string[];
  thumbnails: string[]; // URLや説明など任意形状に変えてOK
};

export default function SuggestionsDisplay({ titles, descriptions, thumbnails }: Props) {
  return (
    <section className="mt-8 bg-white p-6 rounded shadow">
      <h2 className="text-xl font-semibold mb-4">提案内容</h2>

      {/* タイトル一覧 */}
      {titles.length > 0 && (
        <>
          <h3 className="text-lg font-medium mb-2">タイトル</h3>
          <ul className="list-disc list-inside mb-4">
            {titles.map((title, i) => (
              <li key={i} className="text-gray-700">{title}</li>
            ))}
          </ul>
        </>
      )}

      {/* 説明文一覧 */}
      {descriptions.length > 0 && (
        <>
          <h3 className="text-lg font-medium mb-2">説明文</h3>
          <ul className="list-disc list-inside mb-4">
            {descriptions.map((desc, i) => (
              <li key={i} className="text-gray-700">{desc}</li>
            ))}
          </ul>
        </>
      )}

      {/* サムネイル一覧（説明テキスト表示用） */}
      {thumbnails.length > 0 && (
        <>
          <h3 className="text-lg font-medium mb-2">サムネイル案（説明文）</h3>
          <ul className="list-disc list-inside mb-4 text-gray-700 whitespace-pre-wrap">
            {thumbnails.map((thumb, i) => (
              <li key={i}>{thumb}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}