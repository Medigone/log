import { Flex, Box, Heading, Text, Badge, Card, Table, Button, Separator, TextField } from '@radix-ui/themes';
import { useState, useRef } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, CheckIcon, CrossCircledIcon, Pencil1Icon, CameraIcon } from '@radix-ui/react-icons';

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
  articles: Article[];
  photo_livraison?: string;
  signature_client?: string;
  commentaire_livreur?: string;
}

const ColisDetails = () => {
  // Données de test
  const [colisData, setColisData] = useState<ColisData>({
    id: "COL-2024-001",
    custom_numero_sequence: "SEQ-001234",
    status: "Partiellement Livré",
    client: "SARL TECH SOLUTIONS",
    date_creation: "2024-01-15",
    date: "2024-01-15 14:30:00",
    bl: "BL-2024-0156",
    articles: [
      {
        id: "1",
        article: "Ordinateur Portable Dell XPS 13",
        statut_article: "Livré",
        quantite_totale: 2,
        quantite_livree: 2,
        quantite_restante: 0,
        date_derniere_livraison: "2024-01-15 15:45:00",
        commentaire_article: "Livraison effectuée avec succès"
      },
      {
        id: "2",
        article: "Écran Samsung 27 pouces",
        statut_article: "Partiellement livré",
        quantite_totale: 3,
        quantite_livree: 1,
        quantite_restante: 2,
        date_derniere_livraison: "2024-01-15 15:45:00",
        commentaire_article: "Client souhaite reporter la livraison du reste"
      },
      {
        id: "3",
        article: "Clavier mécanique Logitech",
        statut_article: "Non livré",
        quantite_totale: 2,
        quantite_livree: 0,
        quantite_restante: 2,
        raison_non_livraison: "Client absent",
        commentaire_article: "Tentative de livraison à 16h00, bureau fermé"
      }
    ],
    commentaire_livreur: "Livraison partielle effectuée. Le client souhaite reporter le reste à la semaine prochaine."
  });

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
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(colisData.photo_livraison || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // État pour gérer la signature client
  const [isSigningMode, setIsSigningMode] = useState<boolean>(false);
  const [clientSignature, setClientSignature] = useState<string | null>(colisData.signature_client || null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [lastPosition, setLastPosition] = useState<{ x: number; y: number } | null>(null);

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
        setColisData(prevData => ({
          ...prevData,
          photo_livraison: photoDataUrl
        }));
        
        stopCamera();
      }
    }
  };

  // Fonction pour supprimer la photo
  const deletePhoto = () => {
    setCapturedPhoto(null);
    setColisData(prevData => ({
      ...prevData,
      photo_livraison: undefined
    }));
  };

  // Fonctions pour la signature client
  const startSignature = () => {
    setIsSigningMode(true);
    // Initialiser le canvas après que le composant soit rendu
    setTimeout(() => {
      if (signatureCanvasRef.current) {
        const canvas = signatureCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    }, 100);
  };

  const clearSignature = () => {
    if (signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const signatureDataUrl = canvas.toDataURL('image/png');
      setClientSignature(signatureDataUrl);
      
      // Mettre à jour les données du colis
      setColisData(prevData => ({
        ...prevData,
        signature_client: signatureDataUrl
      }));
      
      setIsSigningMode(false);
    }
  };

  const deleteSignature = () => {
    setClientSignature(null);
    setColisData(prevData => ({
      ...prevData,
      signature_client: undefined
    }));
  };

  const cancelSignature = () => {
    setIsSigningMode(false);
    clearSignature();
  };

  // Gestion des événements de dessin pour la signature
  const getCanvasPosition = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const position = getCanvasPosition(e);
    setLastPosition(position);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !lastPosition || !signatureCanvasRef.current) return;
    
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const currentPosition = getCanvasPosition(e);
    
    ctx.beginPath();
    ctx.moveTo(lastPosition.x, lastPosition.y);
    ctx.lineTo(currentPosition.x, currentPosition.y);
    ctx.stroke();
    
    setLastPosition(currentPosition);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPosition(null);
  };

  // Fonction pour sauvegarder les modifications
  const saveQuantity = (articleId: string) => {
    setColisData(prevData => {
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
  };

  // Fonction pour marquer toute la quantité comme livrée
  const markAllAsDelivered = (articleId: string) => {
    setColisData(prevData => {
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
        status: newGlobalStatus
      };
    });
  };

  return (
    <div className="w-full p-4">
      <div className="w-full max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Flex align="center" justify="between" mb="4">
            <div>
              <Heading size="7" style={{ color: '#1e293b' }}>
                Colis {colisData.custom_numero_sequence}
              </Heading>
              <Text size="3" style={{ color: '#64748b' }}>
                {colisData.id}
              </Text>
            </div>
            <Badge size="3" color={getStatusColor(colisData.status) as any}>
              {colisData.status}
            </Badge>
          </Flex>
          
          <Separator size="4" mb="4" />
          
          {/* Informations générales */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <PersonIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Client</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {colisData.client}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <CalendarIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Date de création</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {new Date(colisData.date_creation).toLocaleDateString('fr-FR')}
              </Text>
            </Card>
            
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <BoxIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <Text size="2" weight="medium" style={{ color: '#374151' }}>Bon de livraison</Text>
              </Flex>
              <Text size="4" weight="bold" style={{ color: '#1e293b' }}>
                {colisData.bl}
              </Text>
            </Card>
          </div>
        </div>

        {/* Articles */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Articles ({colisData.articles.length})
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
                {colisData.articles.map((article) => (
                  <Table.Row key={article.id}>
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
                      <Badge size="2" color={getArticleStatusColor(article.statut_article) as any}>
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
                  {colisData.articles.reduce((total, article) => total + article.quantite_totale, 0)} unités
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <Text size="3" weight="medium" style={{ color: '#374151' }}>
                  Montant total :
                </Text>
                <Text size="3" weight="bold" style={{ color: '#1e293b' }}>
                  {(colisData.articles.reduce((total, article) => total + article.quantite_totale, 0) * 150).toLocaleString('fr-FR')} DZD
                </Text>
              </div>
            </div>
          </div>
        </div>

        {/* Informations de livraison */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Informations de livraison
          </Heading>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Box>
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
            
            <Box>
              <Text size="3" weight="medium" mb="2" style={{ color: '#374151' }}>
                Signature client
              </Text>
              
              {isSigningMode ? (
                <div className="w-full">
                  <div className="border-2 border-gray-300 rounded-lg bg-white">
                    <canvas
                      ref={signatureCanvasRef}
                      width={400}
                      height={200}
                      className="w-full h-48 cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                  <Text size="1" style={{ color: '#64748b', fontStyle: 'italic' }} mt="1">
                    Signez dans la zone ci-dessus avec votre doigt ou un stylet
                  </Text>
                  <Flex gap="2" mt="2" justify="center">
                      <Button 
                        size="2" 
                        onClick={saveSignature}
                        style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                      >
                        <CheckIcon className="w-4 h-4" />
                        Valider
                      </Button>
                      <Button 
                        size="2" 
                        variant="outline" 
                        onClick={clearSignature}
                        style={{ cursor: 'pointer', borderColor: '#1e293b', color: '#1e293b' }}
                      >
                        Effacer
                      </Button>
                      <Button 
                        size="2" 
                        variant="outline" 
                        onClick={cancelSignature}
                        style={{ cursor: 'pointer', borderColor: '#1e293b', color: '#1e293b' }}
                      >
                        Annuler
                      </Button>
                    </Flex>
                </div>
              ) : clientSignature ? (
                <div className="w-full">
                  <img 
                    src={clientSignature} 
                    alt="Signature client" 
                    className="w-full h-48 object-contain bg-white rounded-lg border"
                  />
                  <Flex gap="2" mt="2" justify="center">
                      <Button 
                        size="2" 
                        onClick={startSignature}
                        style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                      >
                        <Pencil1Icon className="w-4 h-4" />
                        Nouvelle signature
                      </Button>
                      <Button 
                        size="2" 
                        variant="outline" 
                        onClick={deleteSignature}
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
                      <Pencil1Icon className="w-8 h-8 mx-auto mb-2" style={{ color: '#9ca3af' }} />
                      <Text size="2" style={{ color: '#64748b' }}>
                        Aucune signature
                      </Text>
                    </div>
                  </div>
                  <div className="flex justify-center">
                      <Button 
                        size="2" 
                        mt="2"
                        onClick={startSignature}
                        style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                      >
                        <Pencil1Icon className="w-4 h-4" />
                        Demander la signature
                      </Button>
                    </div>
                </div>
              )}
            </Box>
          </div>
        </div>

        {/* Commentaires */}
        {colisData.commentaire_livreur && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
              Commentaire du livreur
            </Heading>
            <Box className="bg-gray-50 p-4 rounded-lg">
              <Text size="3" style={{ color: '#374151', lineHeight: '1.6' }}>
                {colisData.commentaire_livreur}
              </Text>
            </Box>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-4 justify-end">
          <Button 
            size="3" 
            variant="outline"
            style={{ cursor: 'pointer' }}
          >
            Modifier
          </Button>
          <Button 
            size="3"
            style={{ 
              backgroundColor: '#1e293b', 
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Marquer comme livré
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ColisDetails;