import Link from "next";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full">
        <h1 className="text-4xl font-extrabold text-blue-600 mb-2">404</h1>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-xs text-slate-500 mb-6">
          The requested resource could not be found. Please check your URL or return to the main assessment dashboard.
        </p>
        <a
          href="/"
          className="inline-block py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-all"
        >
          Return to Kindle Jr 5.0
        </a>
      </div>
    </div>
  );
}
