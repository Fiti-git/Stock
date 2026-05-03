import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { listCategories, listProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let products: Awaited<ReturnType<typeof listProducts>> | null = null;
  let categories: { name: string }[] = [];
  let error: string | null = null;
  try {
    [products, { results: categories }] = await Promise.all([
      listProducts({ page: 1, page_size: 24 }),
      listCategories(),
    ]);
  } catch (e: any) {
    error = e?.message || "Could not load catalog.";
  }

  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-brand-light px-6 py-12 sm:px-12 sm:py-16">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">Welcome</div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-brand-dark">
            Arunalu Super Mart, now online.
          </h1>
          <p className="mt-3 text-neutral-700">
            Same fresh inventory as in-store, ready for delivery or pickup.
            Browse the catalog below and check out as a guest in under a minute.
          </p>
        </div>
      </section>

      {categories.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">Shop by category</h2>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((c) => (
              <Link
                key={c.name}
                href={`/category/${encodeURIComponent(c.name)}`}
                className="shrink-0 px-4 py-2 rounded-full border border-neutral-200 hover:border-brand hover:bg-brand-light text-sm font-medium"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-bold">Latest products</h2>
          {products && (
            <span className="text-sm text-neutral-500">{products.count} item{products.count === 1 ? "" : "s"}</span>
          )}
        </div>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        ) : !products || products.results.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products.results.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 px-6 py-12 text-center text-neutral-600">
      <div className="text-base font-medium mb-1">No products published yet</div>
      <div className="text-sm">
        An admin needs to publish at least one item via the
        Product Enrichment page before products appear here.
      </div>
    </div>
  );
}
