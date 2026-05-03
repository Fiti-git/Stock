import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCartButton from "@/components/AddToCartButton";
import { getProduct } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  try {
    const p = await getProduct(params.slug);
    return {
      title: p.seo_title || p.item_name,
      description: p.seo_description || p.short_description,
    };
  } catch {
    return { title: "Product" };
  }
}

const fmtMoney = (v: string | null) => v == null ? null
  : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ProductPage({ params }: { params: { slug: string } }) {
  let p: Awaited<ReturnType<typeof getProduct>>;
  try {
    p = await getProduct(params.slug);
  } catch {
    notFound();
  }

  const price = fmtMoney(p.price);
  const compare = fmtMoney(p.compare_at_price);
  const cover = p.images?.[0];

  return (
    <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
      <div>
        <div className="rounded-xl border border-neutral-200 overflow-hidden bg-neutral-100 aspect-square">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={cover.alt_text || p.item_name}
              className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-neutral-400">No image</div>
          )}
        </div>
        {p.images && p.images.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {p.images.slice(0, 10).map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={img.url} alt={img.alt_text || ""}
                className="aspect-square w-full object-cover rounded-md border border-neutral-200" />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-neutral-500">{p.category}</div>
        <h1 className="text-3xl font-bold mt-1">{p.item_name}</h1>
        <div className="text-sm text-neutral-500 mt-1">SKU {p.item_code}</div>

        <div className="mt-4 flex items-baseline gap-3">
          {price ? (
            <>
              <div className="text-3xl font-extrabold text-brand">{p.currency} {price}</div>
              {compare && Number(p.compare_at_price) > Number(p.price || 0) && (
                <div className="text-base line-through text-neutral-400">{p.currency} {compare}</div>
              )}
            </>
          ) : (
            <div className="text-lg text-neutral-500">Price on request</div>
          )}
        </div>

        {p.short_description && (
          <p className="mt-5 text-neutral-700">{p.short_description}</p>
        )}

        <div className="mt-6">
          <AddToCartButton itemId={p.id} />
        </div>

        {p.long_description && (
          <div className="mt-10">
            <h2 className="text-base font-semibold mb-2">Details</h2>
            <div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-line">
              {p.long_description}
            </div>
          </div>
        )}

        <div className="mt-10 text-sm">
          <Link href="/" className="text-neutral-500 hover:text-brand">← Back to catalog</Link>
        </div>
      </div>
    </div>
  );
}
