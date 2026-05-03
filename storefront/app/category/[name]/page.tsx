import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { listProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { name: string } }) {
  return { title: decodeURIComponent(params.name) };
}

export default async function CategoryPage({
  params, searchParams,
}: {
  params: { name: string };
  searchParams: { page?: string };
}) {
  const category = decodeURIComponent(params.name);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const data = await listProducts({ category, page, page_size: 24 });

  return (
    <div>
      <div className="mb-6">
        <Link href="/category" className="text-sm text-neutral-500 hover:text-brand">
          ← All categories
        </Link>
        <h1 className="text-2xl font-bold mt-1">{category}</h1>
        <div className="text-sm text-neutral-500">{data.count} item{data.count === 1 ? "" : "s"}</div>
      </div>

      {data.results.length === 0 ? (
        <div className="text-neutral-600">No products in this category yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {data.results.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
          {data.total_pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={`/category/${params.name}?page=${page - 1}`}
                  className="px-3 py-1.5 border rounded-md hover:bg-neutral-50">Previous</Link>
              )}
              <span className="text-neutral-500">Page {page} of {data.total_pages}</span>
              {page < data.total_pages && (
                <Link href={`/category/${params.name}?page=${page + 1}`}
                  className="px-3 py-1.5 border rounded-md hover:bg-neutral-50">Next</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
