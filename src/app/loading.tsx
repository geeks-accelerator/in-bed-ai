export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-3 border-gray-300 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 text-sm">Loading...</p>
    </div>
  );
}
