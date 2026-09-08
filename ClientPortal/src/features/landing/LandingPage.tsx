import { useEffect, type CSSProperties, type MouseEvent } from "react"
import { Link } from "react-router-dom"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CoverageBoard } from "@/features/landing/CoverageBoard"
import { StorePreviewMock } from "@/features/landing/StorePreviewMock"
import {
	ACCENT,
	heroPoints,
	portalPoints,
	storePoints,
	storePreviewSteps,
	trackSteps,
	universeExtension,
	universes,
} from "@/features/landing/landingCopy"

const sections = [
	{ id: "store", label: "Store" },
	{ id: "espace", label: "Espace client" },
	{ id: "univers", label: "Univers" },
	{ id: "contact", label: "Contact" },
] as const

function scrollToId(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function SectionLink({
	id,
	children,
	className,
	style,
}: {
	id: string
	children: string
	className?: string
	style?: CSSProperties
}) {
	const onClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault()
		scrollToId(id)
	}
	return (
		<button type="button" onClick={onClick} className={className} style={style}>
			{children}
		</button>
	)
}

const LOGO_SRC = "/assets/log/images/logo_mp_new.png"

function BrandMark({ className }: { className?: string }) {
	return (
		<img src={LOGO_SRC} alt="Modern Pharma" className={cn("h-9 w-auto object-contain object-left", className)} />
	)
}

function PreviewCard({
	title,
	badge,
	kicker,
	detail,
	steps,
}: {
	title: string
	badge: string
	kicker: string
	detail: string
	steps: typeof storePreviewSteps | typeof trackSteps
}) {
	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between gap-3">
				<span className="text-sm font-semibold">{title}</span>
				<span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium" style={{ color: ACCENT }}>
					<span className="size-1.5 rounded-full" style={{ background: ACCENT }} />
					{badge}
				</span>
			</div>
			<div className="mb-4">
				<p className="font-mono text-sm font-semibold">{kicker}</p>
				<p className="text-xs text-zinc-500">{detail}</p>
			</div>
			<ol className="flex flex-col gap-3">
				{steps.map((step) => (
					<li key={step.label} className="flex items-center gap-3 text-sm">
						<span
							className={cn(
								"flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
								step.done && "border-green-600 bg-green-50 text-green-700",
								step.active && "bg-zinc-100",
								!step.done && !step.active && "border-zinc-200 bg-white text-zinc-500",
							)}
							style={step.active ? { borderColor: ACCENT, color: ACCENT } : undefined}
						>
							{step.done ? <Check className="size-3.5" /> : step.glyph}
						</span>
						<span className={cn("min-w-0 flex-1 font-medium", !step.done && !step.active && "text-zinc-500")}>
							{step.label}
						</span>
						<span className="text-xs whitespace-nowrap text-zinc-500">{step.time}</span>
					</li>
				))}
			</ol>
		</div>
	)
}

export function LandingPage() {
	useEffect(() => {
		document.title = "Modern Pharma — parapharmacie et nutrition infantile"
	}, [])

	return (
		<div className="min-h-svh bg-white text-zinc-950 antialiased">
			<header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
				<div className="mx-auto flex max-w-[1180px] items-center gap-4 px-6 py-3">
					<button type="button" onClick={() => scrollToId("top")} className="flex min-w-0 items-center gap-2.5">
						<BrandMark />
						<span className="truncate text-sm font-semibold">Modern Pharma</span>
					</button>
					<nav className="hidden min-w-0 flex-1 items-center gap-5 md:flex">
						{sections.map((section) => (
							<SectionLink
								key={section.id}
								id={section.id}
								className="text-[13.5px] whitespace-nowrap text-zinc-600 hover:text-zinc-950"
							>
								{section.label}
							</SectionLink>
						))}
					</nav>
					<div className="ml-auto flex shrink-0 items-center gap-2.5">
						<Link
							to="/signup"
							className="hidden h-[34px] items-center rounded-lg border border-zinc-200 px-3 text-[13px] font-medium hover:bg-zinc-100 sm:flex"
						>
							Devenir client
						</Link>
						<Link
							to="/login"
							className="flex h-[34px] items-center rounded-lg px-4 text-[13px] font-medium text-white hover:opacity-90"
							style={{ background: ACCENT }}
						>
							Connexion
						</Link>
					</div>
				</div>
			</header>

			<section id="top" className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
				<div className="mx-auto grid max-w-[1180px] items-center gap-11 px-6 py-16 md:grid-cols-2 md:py-[66px]">
					<div className="flex min-w-0 flex-col gap-5">
						<span className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-200 bg-white py-1 pr-2.5 pl-2 text-xs text-zinc-600">
							<span className="size-1.5 rounded-full bg-green-600" />
							Distributeur · vente aux professionnels
						</span>
						<h1 className="text-[clamp(34px,4.6vw,50px)] leading-[1.06] font-semibold tracking-tight text-pretty">
							La distribution, simplement.
						</h1>
						<p className="max-w-xl text-[16.5px] leading-relaxed text-pretty text-zinc-600">
							Parapharmacie et nutrition infantile pour les professionnels. Découvrez nos gammes, commandez en ligne
							et gérez votre activité depuis votre espace client Modern Pharma.
						</p>
						<div className="flex flex-wrap items-center gap-2.5">
							<Link
								to="/login"
								className="flex h-11 items-center rounded-[10px] px-5 text-[14.5px] font-medium text-white hover:opacity-90"
								style={{ background: ACCENT }}
							>
								Accéder au Store →
							</Link>
							<Link
								to="/login"
								className="flex h-11 items-center rounded-[10px] border border-zinc-300 px-4 text-[14.5px] font-medium hover:bg-zinc-100"
							>
								Mon espace client
							</Link>
						</div>
						<div className="flex flex-wrap gap-5 pt-1">
							{heroPoints.map((label) => (
								<span key={label} className="flex items-center gap-1.5 text-sm text-zinc-700">
									<span
										className="flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
										style={{ background: ACCENT }}
									>
										✓
									</span>
									{label}
								</span>
							))}
						</div>
					</div>
					<div className="min-w-0">
						<PreviewCard
							title="Store professionnel"
							badge="En ligne"
							kicker="Commande B2B"
							detail="Catalogue, panier et suivi"
							steps={storePreviewSteps}
						/>
						<p className="mt-3 text-sm text-zinc-500">Le Store et l’espace client, sur ordinateur ou mobile.</p>
					</div>
				</div>
			</section>

			<section id="store" className="border-b border-zinc-200">
				<div className="mx-auto max-w-[1180px] px-6 py-16">
					<div className="mb-10 max-w-2xl">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Store</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Vos commandes professionnelles, en quelques clics
						</h2>
						<p className="mt-3 text-[15.5px] leading-relaxed text-zinc-600">
							Découvrez les gammes distribuées par Modern Pharma et utilisez notre Store professionnel pour préparer
							vos commandes simplement, depuis ordinateur ou mobile.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						{storePoints.map((point, index) => (
							<div key={point.tag} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
								<span
									className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
									style={{ background: ACCENT }}
								>
									{index + 1}
								</span>
								<span className="text-lg font-semibold">{point.title}</span>
								<span className="text-sm leading-relaxed text-zinc-600">{point.desc}</span>
								<div className="mt-auto border-t border-zinc-200 pt-3 text-xs text-zinc-500">{point.tag}</div>
							</div>
						))}
					</div>
					<div className="mt-8">
						<StorePreviewMock />
					</div>
					<div className="mt-8">
						<Link
							to="/login"
							className="inline-flex h-11 items-center rounded-[10px] px-5 text-[14.5px] font-medium text-white hover:opacity-90"
							style={{ background: ACCENT }}
						>
							Découvrir le Store →
						</Link>
					</div>
				</div>
			</section>

			<section id="espace" className="border-b border-zinc-200 bg-zinc-50">
				<div className="mx-auto grid max-w-[1180px] items-start gap-10 px-6 py-16 md:grid-cols-2">
					<div className="min-w-0">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Espace client</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Tout votre suivi dans un seul espace
						</h2>
						<p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-pretty text-zinc-600">
							L’espace client Modern Pharma centralise les informations utiles à votre relation commerciale et vous
							permet de retrouver facilement votre activité.
						</p>
						<div className="mt-8 grid gap-4 sm:grid-cols-2">
							{portalPoints.map((point) => (
								<div key={point.tag} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5">
									<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-500 uppercase">{point.tag}</span>
									<span className="text-lg font-semibold">{point.title}</span>
									<span className="text-sm leading-relaxed text-zinc-600">{point.desc}</span>
								</div>
							))}
						</div>
						<div className="mt-8">
							<Link
								to="/login"
								className="inline-flex h-11 items-center rounded-[10px] border border-zinc-300 bg-white px-5 text-[14.5px] font-medium hover:bg-zinc-100"
							>
								Accéder à mon espace
							</Link>
						</div>
					</div>
					<div className="min-w-0">
						<PreviewCard
							title="Suivi de commande"
							badge="Espace client"
							kicker="Statuts"
							detail="De la validation à la livraison"
							steps={trackSteps}
						/>
						<p className="mt-3 text-sm text-zinc-500">Commandes, livraisons et compte, au même endroit.</p>
					</div>
				</div>
			</section>

			<section id="univers" className="border-b border-zinc-200">
				<div className="mx-auto max-w-[1180px] px-6 py-16">
					<div className="mb-10 max-w-2xl">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Nos univers</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Des gammes pensées pour les professionnels
						</h2>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{universes.map((universe) => (
							<div key={universe.tag} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-5">
								<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-500 uppercase">{universe.tag}</span>
								<span className="text-lg font-semibold">{universe.title}</span>
								<span className="text-sm leading-relaxed text-zinc-600">{universe.desc}</span>
							</div>
						))}
					</div>
					<p className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-600">{universeExtension}</p>
				</div>
			</section>

			<section id="couverture" className="border-b border-zinc-200">
				<div className="mx-auto grid max-w-[1180px] items-start gap-10 px-6 py-16 md:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
					<div className="min-w-0">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Distribution</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Une plateforme digitale. Une distribution bien réelle.
						</h2>
						<p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-pretty text-zinc-600">
							Les outils numériques Modern Pharma simplifient la commande et le suivi, tandis que notre organisation
							commerciale et logistique assure la distribution sur le terrain, depuis Oran.
						</p>
					</div>
					<CoverageBoard />
				</div>
			</section>

			<section id="apropos" className="border-b border-zinc-200">
				<div className="mx-auto max-w-[1180px] px-6 py-16">
					<div className="max-w-2xl">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">À propos</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">Modern Pharma</h2>
						<p className="mt-3 text-[15.5px] leading-relaxed text-zinc-600">
							Modern Pharma est une société algérienne spécialisée dans la distribution de produits de parapharmacie
							et de nutrition infantile auprès des professionnels. Elle associe organisation commerciale, distribution
							terrain et outils numériques afin de simplifier la relation avec ses clients.
						</p>
					</div>
				</div>
			</section>

			<section id="connexion" className="bg-zinc-900 text-zinc-100">
				<div className="mx-auto grid max-w-[1180px] items-stretch gap-4 px-6 py-16 md:grid-cols-2">
					<div id="compte" className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-zinc-700 bg-zinc-800 p-[22px]">
						<span className="text-[14.5px] font-semibold text-white">Déjà client Modern Pharma ?</span>
						<p className="text-[13px] leading-relaxed text-zinc-400">
							Accédez au Store et à votre espace pour commander et suivre votre activité.
						</p>
						<Link
							to="/login"
							className="mt-auto flex h-[42px] items-center justify-center rounded-[10px] bg-white text-[14.5px] font-medium text-zinc-950 hover:bg-zinc-100"
						>
							Accéder à mon espace
						</Link>
					</div>
					<div className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-zinc-700 bg-zinc-800 p-[22px]">
						<span className="text-[14.5px] font-semibold text-white">Vous souhaitez travailler avec Modern Pharma ?</span>
						<p className="text-[13px] leading-relaxed text-zinc-400">
							Réservé aux professionnels. Déposez une demande pour ouvrir un accès.
						</p>
						<Link
							to="/signup"
							className="mt-auto flex h-[42px] items-center justify-center rounded-[10px] bg-white text-[14.5px] font-medium text-zinc-950 hover:bg-zinc-100"
						>
							Devenir client
						</Link>
					</div>
				</div>
			</section>

			<footer id="contact" className="bg-white">
				<div className="mx-auto grid max-w-[1180px] gap-8 px-6 pt-11 pb-8 sm:grid-cols-2 lg:grid-cols-4">
					<div className="flex flex-col gap-2.5">
						<div className="flex items-center gap-2.5">
							<BrandMark className="h-8" />
							<span className="text-sm font-semibold">Modern Pharma</span>
						</div>
						<span className="max-w-[260px] text-[13px] leading-relaxed text-zinc-500">
							Distribution de parapharmacie et de nutrition infantile auprès des professionnels.
						</span>
					</div>
					<div className="flex flex-col gap-2">
						<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Contact</span>
						<span className="text-[13px] text-zinc-700">Zone d’activité, Oran</span>
						<a href="tel:+21341000000" className="text-[13px] text-zinc-700 hover:underline">
							+213 (0)41 00 00 00
						</a>
						<a href="mailto:contact@modernpharma.dz" className="text-[13px] text-zinc-700 hover:underline">
							contact@modernpharma.dz
						</a>
					</div>
					<div className="flex flex-col gap-2">
						<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Horaires</span>
						<span className="text-[13px] text-zinc-700">Dimanche – jeudi · 8 h 00 – 17 h 00</span>
						<span className="text-[13px] text-zinc-700">Samedi · 8 h 00 – 12 h 00</span>
					</div>
					<div className="flex flex-col gap-2">
						<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Raccourcis</span>
						<Link to="/login" className="text-[13px] text-zinc-700 hover:underline">
							Store
						</Link>
						<Link to="/login" className="text-[13px] text-zinc-700 hover:underline">
							Espace client
						</Link>
						<Link to="/signup" className="text-[13px] text-zinc-700 hover:underline">
							Devenir client
						</Link>
						<SectionLink id="couverture" className="text-left text-[13px] text-zinc-700 hover:underline">
							Zones desservies
						</SectionLink>
					</div>
				</div>
				<div className="border-t border-zinc-200">
					<div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-6 py-4 text-xs text-zinc-500">
						<span>© 2026 Modern Pharma. Tous droits réservés.</span>
						<span className="ml-auto flex gap-4">
							<SectionLink id="contact" className="hover:text-zinc-800">
								Mentions légales
							</SectionLink>
							<SectionLink id="contact" className="hover:text-zinc-800">
								Confidentialité
							</SectionLink>
						</span>
					</div>
				</div>
			</footer>
		</div>
	)
}
