export default function Loading() {
  return (
    <div role="status" className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-2 border-gray-200 border-t-pink-500 rounded-full animate-spin mb-4" aria-hidden="true" />
      <p className="text-gray-500 text-sm">Loading...</p>
    </div>
  );
}
