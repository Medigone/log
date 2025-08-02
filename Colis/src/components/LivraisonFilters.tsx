import React, { useState } from 'react';
import { Flex, Button, Text, TextField, Select, Card, Badge } from '@radix-ui/themes';
import { MagnifyingGlassIcon, Cross2Icon, MixerHorizontalIcon } from '@radix-ui/react-icons';
import type { LivraisonFilters as ILivraisonFilters } from '../types/Livraison';

interface LivraisonFiltersProps {
  filters: ILivraisonFilters;
  onFiltersChange: (filters: ILivraisonFilters) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  livreurs?: string[];
  vehicules?: string[];
  communes?: string[];
}

const LivraisonFiltersComponent = ({
  filters,
  onFiltersChange,
  searchTerm,
  onSearchChange,
  livreurs = [],
  vehicules = [],
  communes = []
}: LivraisonFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const statusOptions = [
    { value: '', label: 'Tous les statuts' },
    { value: 'Nouveau', label: 'Nouveau' },
    { value: 'Préparé', label: 'Préparé' },
    { value: 'Partiellement Préparé', label: 'Partiellement Préparé' },
    { value: 'Enlevé', label: 'Enlevé' },
    { value: 'Partiellement Enlevé', label: 'Partiellement Enlevé' },
    { value: 'Livré', label: 'Livré' },
    { value: 'Partiellement Livré', label: 'Partiellement Livré' },
    { value: 'Annulé', label: 'Annulé' }
  ];

  const handleFilterChange = (key: keyof ILivraisonFilters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
    onSearchChange('');
  };

  const getActiveFiltersCount = () => {
    return Object.values(filters).filter(value => value && value !== '').length;
  };

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

  return (
    <Card className="p-4 mb-4">
      <Flex direction="column" gap="3">
        {/* Barre de recherche principale */}
        <Flex align="center" gap="3">
          <div className="flex-1">
            <TextField.Root
              placeholder="Rechercher par nom, livreur, véhicule..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              size="2"
            >
              <TextField.Slot>
                <MagnifyingGlassIcon height="16" width="16" />
              </TextField.Slot>
            </TextField.Root>
          </div>
          
          <Button
            variant={showAdvanced ? 'solid' : 'outline'}
            onClick={() => setShowAdvanced(!showAdvanced)}
            size="2"
          >
            <MixerHorizontalIcon />
            Filtres
            {getActiveFiltersCount() > 0 && (
              <Badge color="blue" size="1" className="ml-1">
                {getActiveFiltersCount()}
              </Badge>
            )}
          </Button>
          
          {(getActiveFiltersCount() > 0 || searchTerm) && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              size="2"
              color="red"
            >
              <Cross2Icon />
              Effacer
            </Button>
          )}
        </Flex>

        {/* Filtres avancés */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t">
            {/* Filtre par statut */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Statut</Text>
              <Select.Root
                value={filters.status || ''}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <Select.Trigger className="w-full" />
                <Select.Content>
                  {statusOptions.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            {/* Filtre par livreur */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Livreur</Text>
              <Select.Root
                value={filters.livreur || ''}
                onValueChange={(value) => handleFilterChange('livreur', value)}
              >
                <Select.Trigger className="w-full" />
                <Select.Content>
                  <Select.Item value="">Tous les livreurs</Select.Item>
                  {livreurs.map((livreur) => (
                    <Select.Item key={livreur} value={livreur}>
                      {livreur}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            {/* Filtre par véhicule */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Véhicule</Text>
              <Select.Root
                value={filters.vehicule || ''}
                onValueChange={(value) => handleFilterChange('vehicule', value)}
              >
                <Select.Trigger className="w-full" />
                <Select.Content>
                  <Select.Item value="">Tous les véhicules</Select.Item>
                  {vehicules.map((vehicule) => (
                    <Select.Item key={vehicule} value={vehicule}>
                      {vehicule}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            {/* Filtre par commune */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Commune</Text>
              <Select.Root
                value={filters.commune || ''}
                onValueChange={(value) => handleFilterChange('commune', value)}
              >
                <Select.Trigger className="w-full" />
                <Select.Content>
                  <Select.Item value="">Toutes les communes</Select.Item>
                  {communes.map((commune) => (
                    <Select.Item key={commune} value={commune}>
                      {commune}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            {/* Filtre par date de début */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Date de début</Text>
              <TextField.Root
                type="date"
                value={filters.date_from || ''}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                size="2"
              />
            </div>

            {/* Filtre par date de fin */}
            <div>
              <Text size="2" weight="medium" className="block mb-1">Date de fin</Text>
              <TextField.Root
                type="date"
                value={filters.date_to || ''}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                size="2"
              />
            </div>
          </div>
        )}

        {/* Affichage des filtres actifs */}
        {getActiveFiltersCount() > 0 && (
          <Flex align="center" gap="2" wrap="wrap" className="pt-2 border-t">
            <Text size="2" color="gray">Filtres actifs:</Text>
            {filters.status && (
              <Badge color={getStatusBadgeColor(filters.status)} size="1">
                {filters.status}
                <button
                  onClick={() => handleFilterChange('status', '')}
                  className="ml-1 hover:bg-white/20 rounded"
                >
                  <Cross2Icon width="10" height="10" />
                </button>
              </Badge>
            )}
            {filters.livreur && (
              <Badge color="blue" size="1">
                {filters.livreur}
                <button
                  onClick={() => handleFilterChange('livreur', '')}
                  className="ml-1 hover:bg-white/20 rounded"
                >
                  <Cross2Icon width="10" height="10" />
                </button>
              </Badge>
            )}
            {filters.vehicule && (
              <Badge color="orange" size="1">
                {filters.vehicule}
                <button
                  onClick={() => handleFilterChange('vehicule', '')}
                  className="ml-1 hover:bg-white/20 rounded"
                >
                  <Cross2Icon width="10" height="10" />
                </button>
              </Badge>
            )}
            {filters.commune && (
              <Badge color="green" size="1">
                {filters.commune}
                <button
                  onClick={() => handleFilterChange('commune', '')}
                  className="ml-1 hover:bg-white/20 rounded"
                >
                  <Cross2Icon width="10" height="10" />
                </button>
              </Badge>
            )}
            {(filters.date_from || filters.date_to) && (
              <Badge color="purple" size="1">
                {filters.date_from && filters.date_to
                  ? `${filters.date_from} - ${filters.date_to}`
                  : filters.date_from
                  ? `Depuis ${filters.date_from}`
                  : `Jusqu'au ${filters.date_to}`
                }
                <button
                  onClick={() => {
                    handleFilterChange('date_from', '');
                    handleFilterChange('date_to', '');
                  }}
                  className="ml-1 hover:bg-white/20 rounded"
                >
                  <Cross2Icon width="10" height="10" />
                </button>
              </Badge>
            )}
          </Flex>
        )}
      </Flex>
    </Card>
  );
};

export default LivraisonFiltersComponent;