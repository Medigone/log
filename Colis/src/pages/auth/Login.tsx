import { Flex, Box, Heading, Text, TextField, Button, Callout } from '@radix-ui/themes';
import { useState } from 'react';
import { useFrappeAuth } from 'frappe-react-sdk';
import { ExclamationTriangleIcon, EyeOpenIcon, EyeClosedIcon } from '@radix-ui/react-icons';

const Login = () => {

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<any>('');

  const {currentUser, login, logout, error, isLoading} = useFrappeAuth();

  const getErrorMessage = (error: any) => {
    if (!error) return '';
    
    // Messages d'erreur courants traduits en français
    const errorTranslations: { [key: string]: string } = {
      'Invalid login credentials': 'Identifiants de connexion invalides',
      'User disabled or does not exist': 'Utilisateur désactivé ou inexistant',
      'Incorrect password': 'Mot de passe incorrect',
      'User does not exist': 'Utilisateur inexistant',
      'Authentication failed': 'Échec de l\'authentification',
      'Network Error': 'Erreur de réseau',
      'Server Error': 'Erreur du serveur',
      'Unauthorized': 'Non autorisé',
      'Incomplete login details': 'Détails de connexion incomplets'
    };
    
    const message = error.message || error.httpStatusText || error.exc_type || 'Erreur de connexion';
    
    // Chercher une traduction exacte
    if (errorTranslations[message]) {
      return errorTranslations[message];
    }
    
    // Chercher une traduction partielle
    for (const [englishMsg, frenchMsg] of Object.entries(errorTranslations)) {
      if (message.toLowerCase().includes(englishMsg.toLowerCase())) {
        return frenchMsg;
      }
    }
    
    return message;
  };

  const onSubmit = () => {
    console.log(username, password);
    login({
      username: username, 
      password: password
    }).then(res => {
      console.log(res)
      setLoginError('')
      // Forcer un rechargement pour déclencher la redirection
      window.location.reload();
    }).catch(err => {
      setLoginError(err)
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  }

  return (
    <div className="w-full h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden flex">
        {/* Section gauche - Contenu promotionnel */}
        <div className="flex-1 bg-slate-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900"></div>
          
          {/* Logo */}
          <div className="relative z-10 p-8">
            <Flex align="center" gap="3">
              <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                <Text size="4" weight="bold" style={{ color: '#1e293b' }}>L</Text>
              </div>
              <Text size="5" weight="bold" style={{ color: 'white' }}>Logoipsum</Text>
            </Flex>
          </div>

          {/* Contenu principal */}
          <div className="relative z-10 px-8 py-16 max-w-lg">
            <Heading size="8" style={{ color: 'white', lineHeight: '1.2', marginBottom: '1rem' }}>
              Les flottes sont le pont qui nous rassemble.
            </Heading>
            
            

          </div>
        </div>

        {/* Section droite - Formulaire de connexion */}
        <div className="w-full max-w-md bg-white flex items-center justify-center p-8">
          <div className="w-full max-w-sm">

            {/* Formulaire */}
            <Box>
              <Heading size="6" mb="2" style={{ color: '#1e293b' }}>Bienvenue</Heading>


              {/* Messages d'erreur */}
              {loginError && (
                <Box mb="4">
                  <Callout.Root color="red" role="alert">
                    <Callout.Icon>
                      <ExclamationTriangleIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      {getErrorMessage(loginError)}
                    </Callout.Text>
                  </Callout.Root>
                </Box>
              )}

              <Flex direction="column" gap="4">
                {/* Champ Email/Utilisateur */}
                <Box>
                  <Text as="label" size="2" weight="medium" mb="2" style={{ color: '#374151' }}>
                    Identifiant
                  </Text>
                  <TextField.Root
                    placeholder="guru.phianotracodet.com"
                    size="3"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyPress={handleKeyPress}
                    style={{ 
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0'
                    }}
                  />
                </Box>

                {/* Champ Mot de passe */}
                <Box>
                  <Text as="label" size="2" weight="medium" mb="2" style={{ color: '#374151' }}>
                    Mot de passe
                  </Text>
                  <Box style={{ position: 'relative' }}>
                    <TextField.Root
                      placeholder="••••••••"
                      type={showPassword ? 'text' : 'password'}
                      size="3"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      style={{ 
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        paddingRight: '2.5rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b'
                      }}
                    >
                      {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                    </button>
                  </Box>
                </Box>

                {/* Bouton de connexion */}
                <Button
                  size="3"
                  onClick={onSubmit}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#1e293b',
                    color: 'white',
                    width: '100%',
                    marginTop: '1rem',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isLoading ? 'Connexion...' : 'Se connecter'}
                </Button>
              </Flex>
            </Box>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login;
