export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-neutral-600">
        <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} Arunalu Super Mart</div>
          <div className="flex gap-4">
            <span>Powered by Stock + POS + Ecom</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
