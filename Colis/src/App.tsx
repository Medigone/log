import { useState } from 'react'
import './App.css'
import { FrappeProvider } from 'frappe-react-sdk'
import "@radix-ui/themes/styles.css";
import { Theme, Flex, Text, Button, Box, Card, Avatar } from "@radix-ui/themes";
import Login from './pages/auth/Login';

function App() {
	const [count, setCount] = useState(0)
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
		<Theme
			appearance="dark"
			accentColor="indigo"
			panelBackground="translucent"
		>
			<FrappeProvider
					socketPort={import.meta.env.VITE_SOCKET_PORT}
					siteName={getSiteName()}
				>
				<Login />
				


				
			</FrappeProvider>
	    </Theme>
	</div>
  )
}

export default App
