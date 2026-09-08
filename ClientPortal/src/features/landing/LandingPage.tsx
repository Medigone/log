import { useEffect, type CSSProperties, type MouseEvent } from "react"
import { Link } from "react-router-dom"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CoverageBoard } from "@/features/landing/CoverageBoard"
import {
	ACCENT,
	heroPoints,
	pillars,
	steps,
	trackSteps,
} from "@/features/landing/landingCopy"

const sections = [
	{ id: "metier", label: "Notre métier" },
	{ id: "commander", label: "Devenir client" },
	{ id: "couverture", label: "Couverture" },
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

export function LandingPage() {
	useEffect(() => {
		document.title = "Modern Pharma"
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
							Distributeur agréé · vente aux professionnels
						</span>
						<h1 className="text-[clamp(34px,4.6vw,50px)] leading-[1.06] font-semibold tracking-tight text-pretty">
							Le distributeur de vos rayons santé et bébé.
						</h1>
						<p className="max-w-xl text-[16.5px] leading-relaxed text-pretty text-zinc-600">
							Modern Pharma approvisionne les détaillants — pharmacies, parapharmacies, supérettes, alimentation
							générale — et les grossistes de l’Ouest algérien. Un interlocuteur, un compte, une livraison qui suit.
						</p>
						<div className="flex flex-wrap items-center gap-2.5">
							<Link
								to="/signup"
								className="flex h-11 items-center rounded-[10px] px-5 text-[14.5px] font-medium text-white hover:opacity-90"
								style={{ background: ACCENT }}
							>
								Devenir client →
							</Link>
							<Link
								to="/login"
								className="flex h-11 items-center rounded-[10px] border border-zinc-300 px-4 text-[14.5px] font-medium hover:bg-zinc-100"
							>
								Je suis déjà client
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
						<div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
							<div className="mb-4 flex items-center justify-between gap-3">
								<span className="text-sm font-semibold">Suivi de commande</span>
								<span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium" style={{ color: ACCENT }}>
									<span className="size-1.5 rounded-full" style={{ background: ACCENT }} />
									En route
								</span>
							</div>
							<div className="mb-4">
								<p className="font-mono text-sm font-semibold">CMD-2026-00194</p>
								<p className="text-xs text-zinc-500">14 références · 6 colis</p>
							</div>
							<ol className="flex flex-col gap-3">
								{trackSteps.map((step) => (
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
						<p className="mt-3 text-sm text-zinc-500">Chaque commande est suivie, de la réception à la remise.</p>
					</div>
				</div>
			</section>

			<section id="metier" className="border-b border-zinc-200">
				<div className="mx-auto max-w-[1180px] px-6 py-16">
					<div className="mb-10 max-w-2xl">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Notre métier</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Distribuer, c’est tenir un engagement de date.
						</h2>
						<p className="mt-3 text-[15.5px] leading-relaxed text-zinc-600">
							Nous savons ce que coûte un rayon vide. Notre organisation est construite autour d’une seule promesse : ce
							qui est commandé arrive, et vous savez quand.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{pillars.map((pillar) => (
							<div key={pillar.tag} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-5">
								<span className="font-mono text-[10px] tracking-[0.08em] text-zinc-500 uppercase">{pillar.tag}</span>
								<span className="text-lg font-semibold">{pillar.title}</span>
								<span className="text-sm leading-relaxed text-zinc-600">{pillar.desc}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="commander" className="border-b border-zinc-200 bg-zinc-50">
				<div className="mx-auto max-w-[1180px] px-6 py-16">
					<div className="mb-10">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Devenir client</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight">Trois étapes, et vous êtes livré.</h2>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{steps.map((step) => (
							<div key={step.n} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
								<span
									className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
									style={{ background: ACCENT }}
								>
									{step.n}
								</span>
								<span className="text-lg font-semibold">{step.title}</span>
								<span className="text-sm leading-relaxed text-zinc-600">{step.desc}</span>
								<div className="mt-auto border-t border-zinc-200 pt-3 text-xs text-zinc-500">{step.meta}</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="couverture" className="border-b border-zinc-200">
				<div className="mx-auto grid max-w-[1180px] items-start gap-10 px-6 py-16 md:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
					<div className="min-w-0">
						<p className="font-mono text-[10px] tracking-[0.08em] text-zinc-600 uppercase">Couverture</p>
						<h2 className="mt-2 text-3xl font-semibold tracking-tight text-pretty">
							Depuis Oran, nous couvrons l’Ouest algérien.
						</h2>
						<p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-pretty text-zinc-600">
							Notre flotte dessert quotidiennement les principales wilayas de l’Ouest algérien depuis nos entrepôts
							d’Oran. Chaque secteur est suivi par un interlocuteur dédié, au plus près des besoins de nos clients.
						</p>
					</div>
					<CoverageBoard />
				</div>
			</section>

			<section id="connexion" className="bg-zinc-900 text-zinc-100">
				<div className="mx-auto grid max-w-[1180px] items-center gap-8 px-6 py-16 md:grid-cols-[1.2fr_0.8fr]">
					<div className="min-w-0">
						<h2 className="text-3xl font-semibold tracking-tight text-pretty text-white">
							Votre compte Modern Pharma, en ligne.
						</h2>
						<p className="mt-3 max-w-lg text-[15.5px] leading-relaxed text-zinc-300">
							Passez commande, suivez vos livraisons et consultez votre solde à toute heure, sans attendre le passage
							de votre délégué.
						</p>
					</div>
					<div id="compte" className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-zinc-700 bg-zinc-800 p-[22px]">
						<span className="text-[14.5px] font-semibold text-white">Accéder à votre compte</span>
						<Link
							to="/login"
							className="flex h-[42px] items-center justify-center rounded-[10px] bg-white text-[14.5px] font-medium text-zinc-950 hover:bg-zinc-100"
						>
							Se connecter
						</Link>
						<Link
							to="/signup"
							className="flex h-[42px] items-center justify-center rounded-[10px] border border-zinc-600 text-[14.5px] font-medium text-white hover:bg-zinc-700"
						>
							Ouvrir un compte professionnel
						</Link>
						<span className="text-[12.5px] leading-relaxed text-zinc-400">
							Nous vendons exclusivement aux professionnels.
						</span>
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
							Distributeur auprès des détaillants et grossistes de l’Ouest algérien.
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
							Se connecter
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
