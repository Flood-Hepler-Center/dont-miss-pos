import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-paper-cream flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-ink-black mb-2 font-[family-name:var(--font-patrick-hand)]">
        Don&apos;t Miss This Saturday
      </h1>
      <p className="text-lg text-gray-600 mb-8 font-[family-name:var(--font-quicksand)]">
        POS Platform
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full">
        <Link
          href="/menu/1"
          className="bg-white rounded-xl p-6 border-2 border-ink-black shadow-sketch hover:shadow-sketch-lg transition-all hover:-translate-y-1 text-center"
        >
          <span className="text-3xl mb-2 block">🍜</span>
          <h2 className="text-lg font-semibold text-ink-black">Customer Menu</h2>
          <p className="text-sm text-gray-500 mt-1">QR Menu for Table 1</p>
        </Link>

        <Link
          href="/login"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-soft-sm hover:shadow-soft-md transition-all hover:-translate-y-1 text-center"
        >
          <span className="text-3xl mb-2 block">👨‍💼</span>
          <h2 className="text-lg font-semibold text-gray-800">Staff Portal</h2>
          <p className="text-sm text-gray-500 mt-1">Dashboard &amp; Orders</p>
        </Link>

        <Link
          href="/admin/dashboard"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-soft-sm hover:shadow-soft-md transition-all hover:-translate-y-1 text-center"
        >
          <span className="text-3xl mb-2 block">⚙️</span>
          <h2 className="text-lg font-semibold text-gray-800">Admin Panel</h2>
          <p className="text-sm text-gray-500 mt-1">Menu &amp; Reports</p>
        </Link>
      </div>
    </div>
  );
}
