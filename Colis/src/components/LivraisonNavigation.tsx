import React from 'react';
import { Flex, Button, Text, Badge } from '@radix-ui/themes';
import { ArrowLeftIcon, GridIcon, ListBulletIcon } from '@radix-ui/react-icons';

interface LivraisonNavigationProps {
  selectedLivraisonId?: string;
  livraisonView: 'dashboard' | 'list';
  onLivraisonViewChange: (view: 'dashboard' | 'list') => void;
  onBackToList?: () => void;
}

const LivraisonNavigation = ({
  selectedLivraisonId,
  livraisonView,
  onLivraisonViewChange,
  onBackToList
}: LivraisonNavigationProps) => {
  return (
    <Flex align="center" justify="between" className="mb-4 p-4 bg-white border-b">
      <Flex align="center" gap="3">
        {selectedLivraisonId && onBackToList && (
          <Button
            variant="ghost"
            size="2"
            onClick={onBackToList}
            className="mr-2"
          >
            <ArrowLeftIcon />
            Retour
          </Button>
        )}
        
        <Text size="4" weight="bold" className="text-gray-900">
          {selectedLivraisonId ? `Livraison ${selectedLivraisonId}` : 'Livraisons'}
        </Text>
        
        {selectedLivraisonId && (
          <Badge color="blue" size="1">
            Détails
          </Badge>
        )}
      </Flex>

      {!selectedLivraisonId && (
        <Flex align="center" gap="2">
          <Button
            variant={livraisonView === 'dashboard' ? 'solid' : 'outline'}
            size="2"
            onClick={() => onLivraisonViewChange('dashboard')}
          >
            <GridIcon />
            Tableau de bord
          </Button>
          <Button
            variant={livraisonView === 'list' ? 'solid' : 'outline'}
            size="2"
            onClick={() => onLivraisonViewChange('list')}
          >
            <ListBulletIcon />
            Liste
          </Button>
        </Flex>
      )}
    </Flex>
  );
};

export default LivraisonNavigation;