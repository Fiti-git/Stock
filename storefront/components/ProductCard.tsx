import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/lib/api";

export default function ProductCard({ p }: { p: ProductCardType }) {
  const price = p.price ? Number(p.price).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) : null;
  return (
    <Link
      href={`/product/${encodeURIComponent(p.slug)}`}
      className="group block rounded-lg border border-neutral-200 hover:border-brand hover:shadow-md transition overflow-hidden bg-white"
    >
      <div className="aspect-square bg-neutral-100 overflow-hidden">
        {p.cover_image?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.cover_image.url}
            alt={p.cover_image.alt_text || p.item_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-neutral-400 text-xs">
            No image
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs text-neutral-500 truncate">{p.category || " "}</div>
        <div className="font-medium text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
          {p.item_name}
        </div>
        <div className="mt-2 text-base font-semibold text-brand">
          {price ? `LKR ${price}` : "Price on request"}
        </div>
      </div>
    </Link>
  );
}
