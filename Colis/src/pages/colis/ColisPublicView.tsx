import { Flex, Box, Heading, Text, Badge, Card, Table } from '@radix-ui/themes';
import { useState, useEffect } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon } from '@radix-ui/react-icons';

interface Article {
  id: string;
  article: string;
  statut_article: string;
  quantite_totale: number;
  quantite_livree: number;
  quantite_restante: number;
  date_derniere_livraison?: string;
}

interface ColisPublicData {
  id: string;
  custom_numero_sequence: string;
  status: string;
  client: string;
  date_creation: string;
  bl: string;
  articles: Article[];
}

interface ColisPublicViewProps {
  colisId?: string;
}

const ColisPublicView = ({ colisId }: ColisPublicViewProps) => {
  const [colisData, setColisData] = useState<ColisPublicData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour récupérer les données publiques du colis
  const fetchPublicColisData = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Appel à l'API publique (à créer côté backend)
      const response = await fetch(`/api/method/log.log.doctype.colis.colis.get_public_colis_data?colis_id=${id}`);
      
      if (!response.ok) {
        throw new Error('Colis non trouvé ou inaccessible');
      }
      
      const result = await response.json();
      
      if (result && result.message) {
        setColisData(result.message);
      } else {
        throw new Error('Données invalides');
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des données:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (colisId) {
      fetchPublicColisData(colisId);
    }
  }, [colisId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'blue';
      case 'Préparé': return 'cyan';
      case 'Enlevé': return 'orange';
      case 'Partiellement Livré': return 'yellow';
      case 'Livré': return 'green';
      case 'Non Livré': return 'red';
      case 'Annulé': return 'gray';
      default: return 'gray';
    }
  };

  const getArticleStatusColor = (status: string) => {
    switch (status) {
      case 'En attente': return 'blue';
      case 'Partiellement livré': return 'yellow';
      case 'Livré': return 'green';
      case 'Non livré': return 'red';
      default: return 'gray';
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des informations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Erreur</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!colisData) {
    return (
      <div className="w-full h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-6xl mb-4">📦</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Aucun colis trouvé</h2>
          <p className="text-gray-600">Vérifiez le QR code scanné</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* En-tête public */}
      <div className="w-full bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
            Informations Colis
          </Text>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Informations générales du colis */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Numéro de séquence */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <Flex align="center" gap="2" className="mb-2">
              <BoxIcon className="w-4 h-4 text-blue-600" />
              <Text size="2" weight="medium" style={{ color: '#64748b' }}>
                Numéro de séquence
              </Text>
            </Flex>
            <Text size="3" weight="bold">
              {colisData.custom_numero_sequence}
            </Text>
          </div>

          {/* Client */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <Flex align="center" gap="2" className="mb-2">
              <PersonIcon className="w-4 h-4 text-green-600" />
              <Text size="2" weight="medium" style={{ color: '#64748b' }}>
                Client
              </Text>
            </Flex>
            <Text size="3" weight="bold">
              {colisData.client}
            </Text>
          </div>

          {/* Date de création */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <Flex align="center" gap="2" className="mb-2">
              <CalendarIcon className="w-4 h-4 text-purple-600" />
              <Text size="2" weight="medium" style={{ color: '#64748b' }}>
                Date de création
              </Text>
            </Flex>
            <Text size="3" weight="bold">
              {new Date(colisData.date_creation).toLocaleDateString('fr-FR')}
            </Text>
          </div>

          {/* Statut */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <Flex align="center" gap="2" className="mb-2">
              <Text size="2" weight="medium" style={{ color: '#64748b' }}>
                Statut
              </Text>
            </Flex>
            <Badge color={getStatusColor(colisData.status)} size="2">
              {colisData.status}
            </Badge>
          </div>
        </div>

        {/* Liste des articles */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Heading size="4" style={{ marginBottom: '32px' }}>
            Articles ({colisData.articles?.length || 0})
          </Heading>
          
          {colisData.articles && colisData.articles.length > 0 ? (
            <div className="overflow-x-auto" style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <Table.Root>
                <Table.Header>
                  <Table.Row style={{ backgroundColor: '#1e293b' }}>
                    <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Article</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Statut</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none', textAlign: 'center' }}>Qté totale</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {colisData.articles.map((article, index) => (
                    <Table.Row 
                      key={article.id || `article-${index}`}
                      style={{ 
                        backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc', 
                        transition: 'background-color 0.2s' 
                      }} 
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} 
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8fafc'}
                    >
                      <Table.Cell>
                        <Text size="3" weight="medium" style={{ color: '#1e293b' }}>
                          {article.article}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={getArticleStatusColor(article.statut_article)} size="1">
                          {article.statut_article}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell style={{ textAlign: 'center' }}>
                        <Text size="3">{article.quantite_totale}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          ) : (
            <div className="text-center py-8">
              <Text style={{ color: '#64748b' }}>Aucun article trouvé</Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ColisPublicView;