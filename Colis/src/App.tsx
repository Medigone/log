import './App.css'
import { FrappeProvider, useFrappeAuth, useFrappeGetDoc } from 'frappe-react-sdk'
import "@radix-ui/themes/styles.css";
import { Theme, Button, Flex, Text } from "@radix-ui/themes";
import { ExitIcon } from '@radix-ui/react-icons';
import Login from './pages/auth/Login';
import ColisDetails from './pages/colis/ColisDetails';

// Barre de navigation
function NavigationBar() {
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
		<div className="w-full bg-white shadow-lg border-b border-gray-200 px-6 py-4">
			<Flex align="center" justify="between">
				<div>
					<Text size="4" weight="bold" style={{ color: '#1e293b' }}>
						Gestion des Colis
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
	);
}

// Composant principal de l'application
function AppContent() {
	const { currentUser, isLoading } = useFrappeAuth();

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

	// Si l'utilisateur est connecté, afficher la barre de navigation et ColisDetails
	// Sinon, afficher la page de login
	if (currentUser) {
		return (
			<div className="min-h-screen bg-gray-100">
				<NavigationBar />
				<ColisDetails />
			</div>
		);
	}

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
