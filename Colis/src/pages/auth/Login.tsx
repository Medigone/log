import React, { useState } from 'react';
import {
  Theme,
  Box,
  Card,
  Flex,
  Text,
  TextField,
  Button,
} from '@radix-ui/themes';
import { useForm } from 'react-hook-form';

interface LoginFormData {
  email: string;
  password: string;
}

const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    
    try {
      // Simuler une requête de connexion
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Ici vous pouvez ajouter votre logique de connexion avec Frappe
      console.log('Données de connexion:', data);
      
    } catch (err) {
      console.error('Erreur de connexion:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Theme
      appearance="dark"
      accentColor="blue"
      panelBackground="solid"
    >
      <Box 
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #581c87 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}
      >
        <Card 
          size="4" 
          style={{
            width: '100%',
            maxWidth: '400px',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgba(71, 85, 105, 0.3)',
            borderRadius: '16px',
            backdropFilter: 'blur(10px)'
          }}
        >
          <Box p="8">
            {/* En-tête */}
            <Box mb="8">
              <Text 
                size="8" 
                weight="bold" 
                style={{ 
                  color: 'white',
                  fontSize: '2rem',
                  lineHeight: '1'
                }}
              >
                Connectez-vous
              </Text>
            </Box>

            {/* Formulaire */}
            <form onSubmit={handleSubmit(onSubmit)}>
              <Flex direction="column" gap="6">
                {/* Champ Email */}
                <Box>
                  <Text 
                    as="label" 
                    size="3" 
                    weight="medium" 
                    mb="3"
                    style={{ 
                      color: 'white',
                      display: 'block'
                    }}
                  >
                    Adresse email
                  </Text>
                  <TextField.Root
                    size="3"
                    placeholder="Entrez votre adresse email"
                    style={{
                      backgroundColor: 'rgba(51, 65, 85, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '1rem',
                      padding: '12px 16px'
                    }}
                    {...register('email', {
                      required: 'L\'adresse email est requise',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Adresse email invalide'
                      }
                    })}
                  />
                  {errors.email && (
                    <Text size="1" color="red" mt="1">
                      {errors.email.message}
                    </Text>
                  )}
                </Box>

                {/* Champ Mot de passe avec lien "Forgot password?" */}
                <Box>
                  <Flex justify="between" align="center" mb="3">
                    <Text 
                      as="label" 
                      size="3" 
                      weight="medium"
                      style={{ color: 'white' }}
                    >
                      Mot de passe
                    </Text>
                  </Flex>
                  <TextField.Root
                    size="3"
                    type="password"
                    placeholder="Enter your password"
                    style={{
                      backgroundColor: 'rgba(51, 65, 85, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '1rem',
                      padding: '12px 16px'
                    }}
                    {...register('password', {
                      required: 'Le mot de passe est requis',
                      minLength: {
                        value: 6,
                        message: 'Le mot de passe doit contenir au moins 6 caractères'
                      }
                    })}
                  />
                  {errors.password && (
                    <Text size="1" color="red" mt="1">
                      {errors.password.message}
                    </Text>
                  )}
                </Box>

                {/* Bouton de connexion */}
                <Box mt="4">
                  <Button
                    type="submit"
                    size="3"
                    loading={isLoading}
                    style={{
                      width: '100%',
                      backgroundColor: '#3b82f6',
                      border: 'none',
                      color: 'white',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      fontSize: '1rem'
                    }}
                  >
                    {isLoading ? 'Connexion en cours...' : 'Se connecter'}
                  </Button>
                </Box>
              </Flex>
            </form>
          </Box>
        </Card>
      </Box>
    </Theme>
  );
};

export default Login;