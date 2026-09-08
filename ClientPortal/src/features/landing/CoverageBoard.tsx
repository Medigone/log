import { ArrowUpRight } from "lucide-react"
import { ACCENT, coverageNetwork } from "@/features/landing/landingCopy"

export function CoverageBoard() {
	return (
		<div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-7 sm:p-8 md:p-9">
			<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Notre réseau</p>
			<p
				className="mt-6 font-semibold tracking-tighter tabular-nums leading-none"
				style={{ color: ACCENT, fontSize: "clamp(4.25rem, 9vw, 7.25rem)" }}
			>
				06
			</p>
			<p className="mt-4 max-w-[14rem] font-mono text-[10px] leading-relaxed tracking-[0.08em] text-zinc-600 uppercase">
				Wilayas principales desservies
			</p>
			<div className="mt-8 border-t border-zinc-200 pt-6">
				<ul
					aria-label="Wilayas principales desservies"
					className="grid grid-cols-1 gap-x-8 gap-y-5 min-[420px]:grid-cols-2"
				>
					{coverageNetwork.map((wilaya) => (
						<li key={wilaya.name}>
							<p className="text-[15px] font-semibold tracking-tight uppercase">{wilaya.name}</p>
							<p className={wilaya.hub ? "mt-0.5 text-xs font-medium text-zinc-700" : "mt-0.5 text-xs text-zinc-400"}>
								{wilaya.role}
							</p>
						</li>
					))}
				</ul>
			</div>
			<p className="mt-8 flex items-center gap-1.5 border-t border-zinc-200 pt-5 text-xs text-zinc-500">
				+ Couverture étendue aux wilayas limitrophes
				<ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
			</p>
		</div>
	)
}
