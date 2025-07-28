import { Flex, Box, Heading, Text, Badge, Card, Table, Button, Separator, TextField } from '@radix-ui/themes';
import { useState, useRef, useEffect } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, CheckIcon, CrossCircledIcon, Pencil1Icon, CameraIcon } from '@radix-ui/react-icons';
import { useFrappeGetDoc, useFrappeDocTypeEventListener } from 'frappe-react-sdk';

interface Article {
  id: string;
  article: string;
  statut_article: string;
  quantite_totale: number;
  quantite_livree: number;
  quantite_restante: number;
  date_derniere_livraison?: string;
  raison_non_livraison?: string;
  commentaire_article?: string;
}

interface ColisData {
  id: string;
  custom_numero_sequence: string;
  status: string;
  client: string;
  date_creation: string;
  date: string;
  bl: string;
  total_art?: number;
  articles: Article[];
  photo_livraison?: string;
  signature_client?: string;
  commentaire_livreur?: string;
}

interface ColisDetailsProps {
  colisId?: string;
}

const ColisDetails = ({ colisId }: ColisDetailsProps) => {
  // Récupération des données du colis depuis Frappe
  const { data: colisData, mutate: mutateColisData, error, isLoading } = useFrappeGetDoc<ColisData>('Colis', colisId, {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'date',
      'bl',
      'total_art',
      'articles',
      'photo_livraison',
      'signature_client',
      'commentaire_livreur'
    ]
  });

  // Écouter les changements sur le doctype Colis
  useFrappeDocTypeEventListener('Colis', () => {
    mutateColisData();
  });

  // État local pour les modifications
  const [localColisData, setLocalColisData] = useState<ColisData | null>(null);

  // Synchroniser les données locales avec les données Frappe
  useEffect(() => {
    if (colisData) {
      setLocalColisData({
        ...colisData,
        id: colisData.name || colisData.id
      });
    }
  }, [colisData]);

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

  // État pour gérer l'édition des quantités
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState<number>(0);

  // État pour gérer la capture photo
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(localColisData?.photo_livraison || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // État pour gérer l'édition du commentaire
  const [isEditingComment, setIsEditingComment] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>(localColisData?.commentaire_livreur || '');

  // Fonction pour démarrer l'édition d'un article
  const startEditing = (articleId: string, currentQuantity: number) => {
    setEditingArticle(articleId);
    setTempQuantity(currentQuantity);
  };

  // Fonction pour annuler l'édition
  const cancelEditing = () => {
    setEditingArticle(null);
    setTempQuantity(0);
  };

  // Fonction pour démarrer la capture photo
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Utiliser la caméra arrière si disponible
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCapturing(true);
      }
    } catch (error) {
      console.error('Erreur lors de l\'accès à la caméra:', error);
      alert('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
    }
  };

  // Fonction pour arrêter la caméra
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  // Fonction pour capturer la photo
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(photoDataUrl);
        
        // Mettre à jour les données du colis
        setLocalColisData(prevData => prevData ? ({
          ...prevData,
          photo_livraison: photoDataUrl
        }) : null);
        
        stopCamera();
      }
    }
  };

  // Fonction pour supprimer la photo
  const deletePhoto = () => {
    setCapturedPhoto(null);
    setLocalColisData(prevData => prevData ? ({
      ...prevData,
      photo_livraison: undefined
    }) : null);
  };

  // Fonctions pour l'édition du commentaire
  const startEditingComment = () => {
    setIsEditingComment(true);
  };

  const saveComment = () => {
    setLocalColisData(prevData => prevData ? ({
      ...prevData,
      commentaire_livreur: commentText
    }) : null);
    setIsEditingComment(false);
  };

  const cancelEditComment = () => {
    setCommentText(localColisData?.commentaire_livreur || '');
    setIsEditingComment(false);
  };

  // Fonction pour sauvegarder les modifications
  const saveQuantity = (articleId: string) => {
    if (!localColisData) return;
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map(article => {
        if (article.id === articleId) {
          const newQuantiteLivree = Math.min(tempQuantity, article.quantite_totale);
          const newQuantiteRestante = article.quantite_totale - newQuantiteLivree;
          
          let newStatut = 'En attente';
          if (newQuantiteLivree === 0) {
            newStatut = 'Non livré';
          } else if (newQuantiteLivree === article.quantite_totale) {
            newStatut = 'Livré';
          } else {
            newStatut = 'Partiellement livré';
          }

          return {
            ...article,
            quantite_livree: newQuantiteLivree,
            quantite_restante: newQuantiteRestante,
            statut_article: newStatut,
            date_derniere_livraison: newQuantiteLivree > 0 ? new Date().toISOString() : article.date_derniere_livraison
          };
        }
        return article;
      });

      // Mettre à jour le statut global du colis
      const totalArticles = updatedArticles.length;
      const articlesLivres = updatedArticles.filter(a => a.statut_article === 'Livré').length;
      const articlesPartiels = updatedArticles.filter(a => a.statut_article === 'Partiellement livré').length;
      
      let newGlobalStatus = 'Nouveau';
      if (articlesLivres === totalArticles) {
        newGlobalStatus = 'Livré';
      } else if (articlesLivres > 0 || articlesPartiels > 0) {
        newGlobalStatus = 'Partiellement Livré';
      }

      return {
        ...prevData,
        articles: updatedArticles,
        status: newGlobalStatus
      };
    });
    
    setEditingArticle(null);
    setTempQuantity(0);
    
    // TODO: Sauvegarder les modifications dans Frappe
    // Vous pouvez utiliser useFrappeUpdateDoc ici
  };

  // Fonction pour marquer toute la quantité comme livrée
  const markAllAsDelivered = (articleId: string) => {
    if (!localColisData) return;
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map(article => {
        if (article.id === articleId) {
          return {
            ...article,
            quantite_livree: article.quantite_totale,
            quantite_restante: 0,
            statut_article: 'Livré',
            date_derniere_livraison: new Date().toISOString()
          };
        }
        return article;
      });

      // Mettre à jour le statut global du colis
      const totalArticles = updatedArticles.length;
      const articlesLivres = updatedArticles.filter(a => a.statut_article === 'Livré').length;
      const articlesPartiels = updatedArticles.filter(a => a.statut_article === 'Partiellement livré').length;
      
      let newGlobalStatus = 'Nouveau';
      if (articlesLivres === totalArticles) {
        newGlobalStatus = 'Livré';
      } else if (articlesLivres > 0 || articlesPartiels > 0) {
        newGlobalStatus = 'Partiellement Livré';
      }

      return {
        ...prevData,
        articles: updatedArticles,
        status: newGlobalStatus,
        date_derniere_livraison: new Date().toISOString()
      };
    });
  };

  // Fonction pour marquer tous les articles comme livrés
  const markAllArticlesAsDelivered = () => {
    if (!localColisData) return;
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map(article => ({
        ...article,
        quantite_livree: article.quantite_totale,
        quantite_restante: 0,
        statut_article: 'Livré',
        date_derniere_livraison: new Date().toISOString()
      }));

      return {
        ...prevData,
        articles: updatedArticles,
        status: 'Livré',
        date_derniere_livraison: new Date().toISOString()
      };
    });
  };

  // Gestion des états de chargement et d'erreur
  if (isLoading) {
    return (
      <div className="w-full p-4">
        <div className="w-full max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <Text size="4" style={{ color: '#64748b' }}>Chargement des données du colis...</Text>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="w-full max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-2xl shadow-lg p-6">
            <Text size="4" style={{ color: '#dc2626' }}>Erreur lors du chargement : {error.message}</Text>
          </div>
        </div>
      </div>
    );
  }

  if (!localColisData) {
    return (
      <div className="w-full p-4">
        <div className="w-full max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <Text size="4" style={{ color: '#64748b' }}>Aucune donnée disponible pour ce colis.</Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4">
      <div className="w-full max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Flex align="center" justify="between" mb="4">
            <div>
              <Heading size="7" style={{ color: '#1e293b' }}>
                Colis {localColisData.custom_numero_sequence}
              </Heading>
              <Text size="3" style={{ color: '#64748b' }}>
                {localColisData.id}
              </Text>
            </div>
            <Badge size="1" color={getStatusColor(localColisData.status) as any}>
              {localColisData.status}
            </Badge>
          </Flex>
          
          <Separator size="4" mb="4" />
          
          {/* Informations générales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <BoxIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Numéro de séquence</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {localColisData.custom_numero_sequence}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <PersonIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Client</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {localColisData.client}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <CalendarIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Date de création</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {new Date(localColisData.date_creation).toLocaleDateString('fr-FR')}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <BoxIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Bon de livraison</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {localColisData.bl}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <BoxIcon className="w-5 h-5" style={{ color: '#10b981' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Total articles</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {localColisData.total_art || localColisData.articles.reduce((total, article) => total + article.quantite_totale, 0)}
              </Text>
            </Card>
          </div>
        </div>

        {/* Articles */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Articles ({localColisData.articles.length})
          </Heading>
          
          <div className="overflow-x-auto">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Article</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Action</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Qté Totale</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Qté Livrée</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Qté Restante</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Statut</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Mise à jour</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              
              <Table.Body>
                {localColisData.articles.map((article, index) => (
                  <Table.Row key={article.id || `article-${index}`}>
                    <Table.Cell>
                      <Text size="3" weight="medium" style={{ color: '#1e293b' }}>
                        {article.article}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {article.quantite_restante > 0 && (
                        <Button
                          size="1"
                          onClick={() => markAllAsDelivered(article.id)}
                          style={{ 
                            cursor: 'pointer', 
                            backgroundColor: '#16a34a', 
                            color: 'white',
                            fontSize: '10px',
                            padding: '2px 6px'
                          }}
                        >
                          ✓
                        </Button>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="3">{article.quantite_totale}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Flex align="center" gap="2">
                        {editingArticle === article.id ? (
                          <Flex align="center" gap="2">
                            <TextField.Root
                              size="1"
                              style={{ width: '80px' }}
                              type="number"
                              min="0"
                              max={article.quantite_totale}
                              value={tempQuantity.toString()}
                              onChange={(e) => setTempQuantity(parseInt(e.target.value) || 0)}
                            />
                            <Button
                              size="1"
                              onClick={() => saveQuantity(article.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <CheckIcon className="w-3 h-3" />
                            </Button>
                            <Button
                              size="1"
                              variant="outline"
                              onClick={cancelEditing}
                              style={{ cursor: 'pointer' }}
                            >
                              <CrossCircledIcon className="w-3 h-3" />
                            </Button>
                          </Flex>
                        ) : (
                          <Flex align="center" gap="2">
                            <Text size="3">{article.quantite_livree}</Text>
                            {article.quantite_livree > 0 && (
                              <CheckIcon className="w-4 h-4" style={{ color: '#10b981' }} />
                            )}
                            <Button
                              size="1"
                              variant="ghost"
                              onClick={() => startEditing(article.id, article.quantite_livree)}
                              style={{ cursor: 'pointer' }}
                            >
                              <Pencil1Icon className="w-3 h-3" />
                            </Button>
                          </Flex>
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Flex align="center" gap="2">
                        <Text size="3">{article.quantite_restante}</Text>
                        {article.quantite_restante > 0 && (
                          <CrossCircledIcon className="w-4 h-4" style={{ color: '#ef4444' }} />
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="1" color={getArticleStatusColor(article.statut_article) as any}>
                        {article.statut_article}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#64748b' }}>
                        {article.date_derniere_livraison 
                          ? new Date(article.date_derniere_livraison).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '-'
                        }
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
          
          {/* Résumé des totaux */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Text size="3" weight="medium" style={{ color: '#374151' }}>
                  Quantité totale :
                </Text>
                <Text size="3" weight="bold" style={{ color: '#1e293b' }}>
                  {localColisData.articles.reduce((total, article) => total + article.quantite_totale, 0)} unités
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <Text size="3" weight="medium" style={{ color: '#374151' }}>
                  Montant total :
                </Text>
                <Text size="3" weight="bold" style={{ color: '#1e293b' }}>
                  {(localColisData.articles.reduce((total, article) => total + article.quantite_totale, 0) * 150).toLocaleString('fr-FR')} DZD
                </Text>
              </div>
            </div>
          </div>

          {/* Bouton pour marquer tous les articles comme livrés */}
          {localColisData.articles.some(article => article.quantite_restante > 0) && (
            <div className="mt-4 flex justify-center">
              <Button 
                size="3"
                onClick={markAllArticlesAsDelivered}
                style={{ 
                  backgroundColor: '#16a34a', 
                  color: 'white',
                  cursor: 'pointer',
                  padding: '12px 24px'
                }}
              >
                <CheckIcon className="w-4 h-4" />
                Marquer comme livré
              </Button>
            </div>
          )}
        </div>

        {/* Informations de livraison */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Informations de livraison
          </Heading>
          
          <div className="flex justify-center">
            <Box className="w-full max-w-md">
              <Text size="3" weight="medium" mb="2" style={{ color: '#374151' }}>
                Photo de livraison
              </Text>
              
              {isCapturing ? (
                <div className="w-full">
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline
                    className="w-full h-48 bg-black rounded-lg object-cover"
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <Flex gap="2" mt="2" justify="center">
                      <Button 
                        size="2" 
                        onClick={capturePhoto}
                        style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                      >
                        <CameraIcon className="w-4 h-4" />
                        Capturer
                      </Button>
                      <Button 
                        size="2" 
                        variant="outline" 
                        onClick={stopCamera}
                        style={{ cursor: 'pointer', borderColor: '#1e293b', color: '#1e293b' }}
                      >
                        Annuler
                      </Button>
                    </Flex>
                </div>
              ) : capturedPhoto ? (
                <div className="w-full">
                  <img 
                    src={capturedPhoto} 
                    alt="Photo de livraison" 
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                  <Flex gap="2" mt="2" justify="center">
                      <Button 
                        size="2" 
                        onClick={startCamera}
                        style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                      >
                        <CameraIcon className="w-4 h-4" />
                        Nouvelle photo
                      </Button>
                      <Button 
                        size="2" 
                        variant="outline" 
                        onClick={deletePhoto}
                        style={{ cursor: 'pointer', borderColor: '#ef4444', color: '#ef4444' }}
                      >
                        Supprimer
                      </Button>
                    </Flex>
                </div>
              ) : (
                <div className="w-full">
                  <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <CameraIcon className="w-8 h-8 mx-auto mb-2" style={{ color: '#9ca3af' }} />
                      <Text size="2" style={{ color: '#64748b' }}>
                        Aucune photo
                      </Text>
                    </div>
                  </div>
                  <div className="flex justify-center">
                     <Button 
                       size="2" 
                       mt="2"
                       onClick={startCamera}
                       style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                     >
                       <CameraIcon className="w-4 h-4" />
                       Prendre une photo
                     </Button>
                   </div>
                </div>
              )}
            </Box>
          </div>
        </div>

        {/* Commentaires */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Commentaire
          </Heading>
          
          {isEditingComment ? (
            <div>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Ajoutez un commentaire..."
                style={{ fontSize: '14px', lineHeight: '1.6' }}
              />
              <Flex gap="2" mt="3" justify="end">
                <Button 
                  size="2" 
                  variant="outline"
                  onClick={cancelEditComment}
                  style={{ cursor: 'pointer', borderColor: '#6b7280', color: '#6b7280' }}
                >
                  Annuler
                </Button>
                <Button 
                  size="2" 
                  onClick={saveComment}
                  style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                >
                  <CheckIcon className="w-4 h-4" />
                  Enregistrer
                </Button>
              </Flex>
            </div>
          ) : (
            <div>
              <Box className="bg-gray-50 p-4 rounded-lg min-h-[100px] flex items-start">
                {commentText ? (
                  <Text size="3" style={{ color: '#374151', lineHeight: '1.6' }}>
                    {commentText}
                  </Text>
                ) : (
                  <Text size="3" style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                    Aucun commentaire
                  </Text>
                )}
              </Box>
              <div className="flex justify-end mt-3">
                <Button 
                  size="2" 
                  variant="outline"
                  onClick={startEditingComment}
                  style={{ cursor: 'pointer', borderColor: '#1e293b', color: '#1e293b' }}
                >
                  <Pencil1Icon className="w-4 h-4" />
                  Modifier
                </Button>
              </div>
            </div>
          )}
        </div>


      </div>
    </div>
  );
};

export default ColisDetails;