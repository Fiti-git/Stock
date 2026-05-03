import Link from "next/link";
import { listCategories } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };

export default async function CategoryIndex() {
  const { results } = await listCategories();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All categories</h1>
      {results.length === 0 ? (
        <div className="text-neutral-600">No categories yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {results.map((c) => (
            <Link
              key={c.name}
              href={`/category/${encodeURIComponent(c.name)}`}
              className="rounded-lg border border-neutral-200 hover:border-brand p-4 hover:shadow-sm transition"
            >
              <div className="font-semibold">{c.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
