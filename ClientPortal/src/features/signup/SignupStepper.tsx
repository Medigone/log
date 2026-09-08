import { Check, ClipboardList, Phone, Store, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const SIGNUP_STEPS = [
	{ title: "Inscription en ligne", detail: "Formulaire de candidature", icon: ClipboardList },
	{ title: "Confirmation par un représentant", detail: "Après un appel téléphonique", icon: Phone },
	{ title: "Accès au Store", detail: "Ouverture du compte client", icon: Store },
] as const

type StepState = "completed" | "active" | "pending"

function stepState(index: number, currentStep: number): StepState {
	if (index + 1 < currentStep) return "completed"
	if (index + 1 === currentStep) return "active"
	return "pending"
}

function StepIcon({ icon: Icon, state }: { icon: LucideIcon; state: StepState }) {
	return (
		<span
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-full border text-zinc-700",
				state === "completed" && "border-green-600 bg-green-50 text-green-700",
				state === "active" && "border-zinc-950 bg-zinc-950 text-white",
				state === "pending" && "border-zinc-200 bg-white text-zinc-500",
			)}
		>
			{state === "completed" ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-4" aria-hidden />}
		</span>
	)
}

function StepBadge({ state }: { state: StepState }) {
	if (state === "active") return <Badge>En cours</Badge>
	if (state === "completed") return <Badge variant="success">Terminé</Badge>
	return (
		<Badge variant="secondary" className="text-zinc-500">
			En attente
		</Badge>
	)
}

export function SignupStepper({ currentStep }: { currentStep: number }) {
	return (
		<ol className="flex flex-col gap-4 md:flex-row md:gap-0" aria-label="Étapes pour devenir client">
			{SIGNUP_STEPS.map((step, index) => {
				const state = stepState(index, currentStep)
				const last = index === SIGNUP_STEPS.length - 1
				return (
					<li
						key={step.title}
						className={cn("relative flex min-w-0 flex-1 items-start gap-3 md:flex-col md:pr-6", last && "md:pr-0")}
						aria-current={state === "active" ? "step" : undefined}
					>
						<div className="flex items-center gap-3 md:w-full">
							<StepIcon icon={step.icon} state={state} />
							{!last && (
								<span className="hidden h-px min-w-0 flex-1 bg-zinc-200 md:block" aria-hidden />
							)}
						</div>
						<div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
							<p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Étape {index + 1}</p>
							<p className={cn("text-sm font-semibold", state === "pending" && "text-zinc-500")}>{step.title}</p>
							<p className="text-xs text-zinc-500">{step.detail}</p>
							<StepBadge state={state} />
						</div>
					</li>
				)
			})}
		</ol>
	)
}
