import './App.css'
import { FrappeProvider, useFrappeAuth, useFrappeGetDoc } from 'frappe-react-sdk'
import "@radix-ui/themes/styles.css";
import { Theme, Button, Flex, Text, Tabs } from "@radix-ui/themes";
import { ExitIcon, BoxIcon, FileTextIcon } from '@radix-ui/react-icons';
import { useState, useEffect } from 'react';
import Login from './pages/auth/Login';
import ColisDetails from './pages/colis/ColisDetails';
import ColisPublicView from './pages/colis/ColisPublicView';
import { DeliveryNotesList } from './pages/delivery-notes';

// Barre de navigation
function NavigationBar({ selectedColisId, onBackToList }: { selectedColisId: string | null; onBackToList: () => void }) {
	const { logout, currentUser } = useFrappeAuth();
	// Récupérer les informations complètes de l'utilisateur
	const { data: userData } = useFrappeGetDoc('User', currentUser || undefined);

	const handleLogout = async () => {
		try {
			await logout();
			window.location.reload();
		} catch (error) {
			console.error('Erreur lors de la déconnexion:', error);
		}
	};

	if (!currentUser) return null;

	// Afficher le nom complet ou l'email si le nom complet n'est pas disponible
	const displayName = userData?.full_name || userData?.email || currentUser;

	return (
		<div className="w-full bg-white border-b border-gray-200">
			{/* En-tête avec titre et bouton de déconnexion */}
			<div className="px-6 py-4">
				<Flex align="center" justify="between">
					<div>
						<Text size="4" weight="bold" style={{ color: '#1e293b' }}>
							Gestion Logistique
						</Text>
					</div>
					<Flex align="center" gap="4">
						<Text size="2" style={{ color: '#64748b' }}>
							Bonjour, {displayName}
						</Text>
						<Button 
							size="2" 
							variant="outline" 
							onClick={handleLogout}
							style={{ cursor: 'pointer' }}
						>
							<ExitIcon className="w-4 h-4" />
							Déconnexion
						</Button>
					</Flex>
				</Flex>
			</div>
			
			{/* Navigation conditionnelle */}
			{selectedColisId && (
				<div className="px-6 pb-4">
					<Button 
						size="2" 
						variant="outline" 
						onClick={onBackToList}
						style={{ cursor: 'pointer' }}
					>
						← Retour aux bons de livraison
					</Button>
				</div>
			)}
		</div>
	);
}

// Composant principal de l'application
function AppContent() {
	const { currentUser, isLoading } = useFrappeAuth();
	const [selectedColisId, setSelectedColisId] = useState<string | null>(null);
	const [isPublicAccess, setIsPublicAccess] = useState<boolean>(false);

	// Vérifier les paramètres URL pour l'accès direct aux détails d'un colis
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const colisParam = urlParams.get('colis');
		const publicParam = urlParams.get('public');
		
		if (colisParam) {
			setSelectedColisId(colisParam);
			// Si le paramètre public=1 est présent ou si l'utilisateur n'est pas connecté
			if (publicParam === '1' || !currentUser) {
				setIsPublicAccess(true);
			}
		}
	}, [currentUser]);

	// Affichage d'un loader pendant la vérification de l'authentification
	if (isLoading) {
		return (
			<div className="w-full h-screen bg-gray-100 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Chargement...</p>
				</div>
			</div>
		);
	}

	// Si accès public demandé avec un colis spécifique, afficher la vue publique
	if (isPublicAccess && selectedColisId) {
		return <ColisPublicView colisId={selectedColisId} />;
	}

	// Si l'utilisateur est connecté, afficher la barre de navigation et le contenu selon la sélection
	if (currentUser) {
		return (
			<div className="min-h-screen bg-gray-100">
				<NavigationBar selectedColisId={selectedColisId} onBackToList={() => setSelectedColisId(null)} />
				<div className="pt-4">
					{selectedColisId ? (
						<ColisDetails colisId={selectedColisId} />
					) : (
						<DeliveryNotesList onColisSelect={setSelectedColisId} />
					)}
				</div>
			</div>
		);
	}

	// Si un colis est demandé mais l'utilisateur n'est pas connecté, afficher la vue publique
	if (selectedColisId && !currentUser) {
		return <ColisPublicView colisId={selectedColisId} />;
	}

	// Sinon, afficher la page de login
	return <Login />;
}

function App() {
	const getSiteName = () => {
			// @ts-ignore
			if (window.frappe?.boot?.versions?.frappe && (window.frappe.boot.versions.frappe.startsWith('15') || window.frappe.boot.versions.frappe.startsWith('16'))) {
				// @ts-ignore
				return window.frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME
			}
			return import.meta.env.VITE_SITE_NAME
		}

	return (
		<div>
			<Theme>
				<FrappeProvider
						socketPort={import.meta.env.VITE_SOCKET_PORT}
						siteName={getSiteName()}
					>
					<AppContent />
				</FrappeProvider>
			</Theme>
		</div>
	)
}

export default App
