import { PackagePlus, Search } from "lucide-react"
import { ProductImage } from "@/features/store/ProductImage"
import { storePreviewItems } from "@/features/landing/landingCopy"

export function StorePreviewMock() {
	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
			<div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
				<div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-400">
					<Search className="size-4 shrink-0" aria-hidden />
					<span>Rechercher un produit…</span>
				</div>
				<span className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-zinc-200 px-3 text-[13px] font-medium text-zinc-700">
					<PackagePlus className="size-4" aria-hidden />
					Demander un article
				</span>
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{storePreviewItems.map((item) => (
					<article key={item.name} className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-zinc-200 p-2">
						<div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-100">
							<ProductImage src={item.image} alt={item.name} compact className="absolute inset-0 size-full" />
						</div>
						<p className="truncate text-[0.65rem] text-zinc-500">{item.group}</p>
						<p className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</p>
						<p className="text-xs text-zinc-500">Sur devis</p>
					</article>
				))}
			</div>
			<p className="mt-3 text-xs text-zinc-500">Aperçu illustratif. L’accès au Store se fait après connexion.</p>
		</div>
	)
}
