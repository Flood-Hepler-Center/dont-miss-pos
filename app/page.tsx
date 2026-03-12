export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 font-mono">
      <div className="max-w-md w-full border-2 border-black p-8 text-center space-y-4">
        <div className="text-sm tracking-widest">
          ══════════════════════════
        </div>
        <div className="py-4">
          <h1 className="text-4xl font-bold tracking-[0.2em] mb-2">
            don&apos;t miss this saturday
          </h1>
          <p className="text-xs uppercase tracking-widest text-gray-500">
            SYSTEM ENGINE v1.0
          </p>
        </div>
        <div className="text-sm tracking-widest">
          ══════════════════════════
        </div>
        <div className="pt-4 grid grid-cols-1 gap-4">
          <a 
            href="/login" 
            className="border-2 border-black p-4 hover:bg-black hover:text-white transition-colors font-bold uppercase"
          >
            [ OPEN ACCESS ]
          </a>
        </div>
        <div className="text-[10px] text-gray-400 font-mono mt-8">
          TIMESTAMP: {new Date().toISOString().split('T')[0]}<br />
          LOC: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
