import { Flex, Heading, Text, Badge, Card, Table, Button, Box } from '@radix-ui/themes';
import React, { useState, useEffect, useMemo } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, ArrowLeftIcon } from '@radix-ui/react-icons';
import { Package as PackageIcon, MapPin as MapPinIcon, FileText as FileTextIcon, Eye as EyeIcon } from 'lucide-react';
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeDocTypeEventListener } from 'frappe-react-sdk';
import type { Livraison, LivraisonColis, LivraisonBonDeLivraison } from '../../types/Livraison';
import type { Colis } from '../../types/DeliveryNote';

interface LivraisonDetailsProps {
  livraisonId: string;
  onBack?: () => void;
  onColisSelect?: (colisId: string) => void;
}

const LivraisonDetails = ({ livraisonId, onBack, onColisSelect }: LivraisonDetailsProps) => {

  // Récupération des détails de la livraison avec les tables enfants incluses
  const { data: livraison, mutate: mutateLivraison, error } = useFrappeGetDoc<Livraison>('Livraison', livraisonId);

  // Récupération des colis liés à cette livraison
  const { data: colisData, mutate: mutateColis } = useFrappeGetDocList<any>('Colis', {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'bl',
      'articles'
    ],
    filters: [['bl', '=', livraisonId]],
    limit: 1000
  });

  // Écouter les changements en temps réel
  useFrappeDocTypeEventListener('Livraison', (d) => {
    if (d.name === livraisonId) {
      mutateLivraison();
    }
  });

  useFrappeDocTypeEventListener('Colis', () => {
    mutateColis();
  });

  // Fonction pour obtenir la couleur du badge de statut
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Livré':
        return 'green';
      case 'Partiellement Livré':
        return 'blue';
      case 'Enlevé':
        return 'orange';
      case 'Partiellement Enlevé':
        return 'yellow';
      case 'Préparé':
        return 'purple';
      case 'Partiellement Préparé':
        return 'violet';
      case 'Annulé':
        return 'red';
      case 'Nouveau':
      default:
        return 'gray';
    }
  };

  // Fonction pour formater la date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Fonction pour formater le montant
  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0,00 DZD';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' DZD';
  };

  // Extraction des données des tables enfants depuis le document parent
  const livraisonColis = livraison?.colis || [];
  const livraisonBonsLivraison = livraison?.bons_de_livraison || [];

  // Calcul des statistiques
  const stats = React.useMemo(() => {
    // Utiliser les données des tables enfants du document parent si disponibles, sinon utiliser les données des requêtes séparées
    const colisToUse = livraisonColis.length > 0 ? livraisonColis : (colisData || []);
    
    if (colisToUse.length === 0) return null;
    
    const statusCounts = colisToUse.reduce((acc, colis) => {
      acc[colis.status] = (acc[colis.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueClients = new Set(colisToUse.map(c => c.client).filter(Boolean));

    return {
      totalColis: colisToUse.length,
      statusCounts,
      uniqueClients: uniqueClients.size,
      uniqueCommunes: 0 // Pas de données de communes disponibles
    };
  }, [livraisonColis, colisData]);

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <Text color="red">Erreur lors du chargement de la livraison: {error.message}</Text>
        </Card>
      </div>
    );
  }

  if (!livraison) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête avec bouton retour */}
      <Flex align="center" gap="4">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeftIcon className="w-4 h-4" />
            Retour
          </Button>
        )}
        <div>
          <Heading size="6" className="text-gray-900">{livraison.name}</Heading>
          <Text size="2" className="text-gray-600 mt-1">
            Livraison du {formatDate(livraison.date_liv)}
          </Text>
        </div>
      </Flex>

      {/* Informations principales */}
      <Card className="p-6">
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Heading size="4">Informations générales</Heading>
            <Badge color={getStatusBadgeColor(livraison.status)} size="3">
              {livraison.status}
            </Badge>
          </Flex>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {livraison.livreur && (
              <div className="flex items-center gap-2">
                <PersonIcon className="w-5 h-5 text-gray-500" />
                <div>
                  <Text size="1" className="text-gray-500">Livreur : </Text>
                  <Text size="2" weight="medium">{livraison.livreur}</Text>
                </div>
              </div>
            )}

            {livraison.vehicule && (
              <div className="flex items-center gap-2">
                <Text size="2" className="text-gray-500">🚗</Text>
                <div>
                  <Text size="1" className="text-gray-500">Véhicule : </Text>
                  <Text size="2" weight="medium">{livraison.vehicule}</Text>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <PackageIcon className="w-5 h-5 text-gray-500" />
              <div>
                <Text size="1" className="text-gray-500">Colis : </Text>
                <Text size="2" weight="medium">{livraison.total_colis || 0}</Text>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <BoxIcon className="w-5 h-5 text-gray-500" />
              <div>
                <Text size="1" className="text-gray-500">Articles : </Text>
                <Text size="2" weight="medium">{livraison.total_paiements || 0}</Text>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <Text size="3" weight="bold" className="text-green-600">
                              Total: {formatAmount(livraison.total_montant_a_encaisser)}
            </Text>
          </div>
        </Flex>
      </Card>

      {/* Statistiques */}
      {stats && (
        <Card className="p-6">
          <Heading size="4" className="mb-4">Statistiques</Heading>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <Text size="4" weight="bold" className="text-blue-600">
                {stats.totalColis}
              </Text>
              <Text size="1" className="text-gray-500"> Colis total</Text>
            </div>
            <div className="text-center">
              <Text size="4" weight="bold" className="text-green-600">
                {stats.uniqueClients}
              </Text>
              <Text size="1" className="text-gray-500"> Clients</Text>
            </div>
            <div className="text-center">
              <Text size="4" weight="bold" className="text-purple-600">
                {stats.uniqueCommunes}
              </Text>
              <Text size="1" className="text-gray-500"> Communes</Text>
            </div>
            <div className="text-center">
              <Text size="4" weight="bold" className="text-orange-600">
                {Object.keys(stats.statusCounts).length}
              </Text>
              <Text size="1" className="text-gray-500"> Statuts différents</Text>
            </div>
          </div>
        </Card>
      )}

      {/* Liste des Colis */}
      <div>
        <Heading size="4" className="mb-4">Colis ({(livraisonColis.length > 0 ? livraisonColis : colisData || []).length})</Heading>
          <Card>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Colis</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>N° Séquence</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Client</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Bon de livraison</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Statut</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(livraisonColis.length > 0 ? livraisonColis : (colisData || []))?.map((colis) => (
                  <Table.Row key={colis.name}>
                    <Table.Cell>
                      <Text weight="medium">{colis.name}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{colis.custom_numero_sequence || colis.numero_sequence || '-'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{colis.client || '-'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{colis.bl || colis.bon_livraison || '-'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusBadgeColor(colis.status)} size="1">
                        {colis.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        size="1"
                        variant="outline"
                        onClick={() => onColisSelect?.(colis.name)}
                      >
                        <EyeIcon className="w-3 h-3" />
                        Voir
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
            
            {(livraisonColis.length === 0 && (!colisData || colisData.length === 0)) && (
              <div className="p-8 text-center">
                <PackageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <Text className="text-gray-500">Aucun colis dans cette livraison</Text>
              </div>
            )}
          </Card>
        </div>
    </div>
  );
};

export default LivraisonDetails;