import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <h1 className="text-8xl font-black text-gray-100">404</h1>
      <h2 className="text-2xl font-bold text-gray-900 mt-4">Page not found</h2>
      <p className="text-gray-500 mt-2 text-center max-w-sm">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className="mt-8 bg-black text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition">
        Back to Home
      </Link>
    </div>
  )
}
