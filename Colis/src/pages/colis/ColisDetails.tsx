import { Flex, Box, Heading, Text, Badge, Card, Table, Button, Separator, TextField } from '@radix-ui/themes';
import { useState, useRef, useEffect } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, CheckIcon, CrossCircledIcon, Pencil1Icon, CameraIcon, FileTextIcon } from '@radix-ui/react-icons';
import { useFrappeGetDoc, useFrappeDocTypeEventListener, useFrappeUpdateDoc, useFrappeGetCall, useFrappeAuth } from 'frappe-react-sdk';

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
  date_derniere_livraison?: string;
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
      'commentaire_livreur',
      'date_derniere_livraison'
    ]
  });

  // Hook pour mettre à jour le document Frappe
  const { updateDoc: updateColis, loading: isUpdating, error: updateError } = useFrappeUpdateDoc();

  // Hook pour l'authentification Frappe
  const { currentUser } = useFrappeAuth();

  // Fonction pour appeler l'API d'upload via l'API Frappe React SDK
  const uploadPhoto = async (colisId: string, fileData: string, filename: string) => {
    try {
      console.log('Tentative d\'upload avec authentification Frappe...');
      
      // Récupérer le token CSRF depuis window.csrf_token
      const csrfToken = (window as any).csrf_token;
      
      // Appeler notre méthode backend personnalisée avec authentification
      const response = await fetch('/api/method/log.log.doctype.colis.colis.upload_photo_livraison', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          colis_id: colisId,
          file_data: fileData,
          filename: filename
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Upload success:', result);
        
        if (result && result.message && result.message.file_url) {
          // Mettre à jour le champ photo_livraison du colis
          await updateColis('Colis', colisId, {
            photo_livraison: result.message.file_url
          });
          
          return {
            success: true,
            file_url: result.message.file_url
          };
        } else {
          throw new Error('Réponse invalide du serveur');
        }
      } else {
        const errorText = await response.text();
        console.error('Upload error:', errorText);
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Erreur upload:', error);
      throw error;
    }
  };



  // Écouter les changements sur le doctype Colis - Commenté pour éviter les conflits de synchronisation
  // useFrappeDocTypeEventListener('Colis', () => {
  //   mutateColisData();
  // });

  // État local pour les modifications
  const [localColisData, setLocalColisData] = useState<ColisData | null>(null);

  // Synchroniser les données locales avec les données Frappe
  useEffect(() => {
    if (colisData) {
      setLocalColisData({
        ...colisData,
        id: colisData.name || colisData.id
      });
      // Réinitialiser l'état d'édition lors du chargement des données
      setEditingArticle(null);
      setTempQuantities({});
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
  const [tempQuantities, setTempQuantities] = useState<{[key: string]: number}>({});

  // État pour gérer la capture photo
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(localColisData?.photo_livraison || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // État pour gérer l'édition du commentaire
  const [isEditingComment, setIsEditingComment] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>(localColisData?.commentaire_livreur || '');

  // État pour gérer le chargement de la sauvegarde
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Fonction pour sauvegarder les modifications vers le backend
  const saveToBackend = async (updatedData: Partial<ColisData>) => {
    if (!colisId) return;
    
    setIsSaving(true);
    try {
      await updateColis('Colis', colisId, updatedData);
      console.log('Données sauvegardées avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde des modifications');
    } finally {
      setIsSaving(false);
    }
  };

  // Fonction pour démarrer l'édition d'un article
  const startEditing = (articleId: string, currentQuantity: number) => {
    console.log('Starting edit for article:', articleId, 'with quantity:', currentQuantity);
    
    // Réinitialiser l'état d'édition pour éviter les conflits
    setEditingArticle(null);
    setTempQuantities({});
    
    // Démarrer l'édition pour cet article spécifique
    setTimeout(() => {
      setEditingArticle(articleId);
      setTempQuantities({
        [articleId]: currentQuantity
      });
    }, 0);
  };

  // Fonction pour annuler l'édition
  const cancelEditing = () => {
    console.log('Canceling edit for article:', editingArticle);
    setEditingArticle(null);
    setTempQuantities({});
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
  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        
        // Convertir le canvas en base64
        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        try {
          // Debug: Afficher les données envoyées
          console.log('Capture photo - colisId:', colisId);
          console.log('Capture photo - photoDataUrl length:', photoDataUrl.length);
          
          // Appeler notre API personnalisée
          const result = await uploadPhoto(colisId || '', photoDataUrl, `photo_livraison_${colisId}_${Date.now()}.jpg`);
          
          console.log('Capture photo result:', result);
          
          if (result && result.success) {
            const fileUrl = result.file_url; // URL du format /files/filename.png
            
            setCapturedPhoto(fileUrl);
            
            // Mettre à jour les données du colis
            setLocalColisData(prevData => prevData ? ({
              ...prevData,
              photo_livraison: fileUrl
            }) : null);
          } else {
            throw new Error('Erreur lors de l\'upload');
          }
        } catch (error) {
          console.error('Erreur lors de l\'upload du fichier:', error);
          alert('Erreur lors de l\'upload du fichier image');
        }
        
        stopCamera();
      }
    }
  };

    // Fonction pour sélectionner une image depuis la galerie
  const selectFromGallery = () => {
    // Vérifier que colisId existe
    if (!colisId) {
      alert('Erreur: ID du colis manquant');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Préférer la caméra arrière sur mobile
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          // Convertir le fichier en base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const fileData = e.target?.result as string;
            
            // Debug: Afficher les données envoyées
            console.log('Upload photo - colisId:', colisId);
            console.log('Upload photo - filename:', file.name);
            console.log('Upload photo - fileData length:', fileData.length);
            
            // Appeler notre API personnalisée
            const result = await uploadPhoto(colisId, fileData, file.name);
            
            console.log('API result:', result);
            
            if (result && result.success) {
              const fileUrl = result.file_url; // URL du format /files/filename.png
              
              setCapturedPhoto(fileUrl);
              
              // Mettre à jour les données du colis
              setLocalColisData(prevData => prevData ? ({
                ...prevData,
                photo_livraison: fileUrl
              }) : null);
            } else {
              throw new Error('Erreur lors de l\'upload');
            }
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Erreur lors de l\'upload du fichier:', error);
          alert('Erreur lors de l\'upload du fichier image');
        }
      }
    };
    
    input.click();
  };

  // Fonction pour supprimer la photo
  const deletePhoto = async () => {
    if (!colisId) {
      alert('Erreur: ID du colis manquant');
      return;
    }
    
    try {
      console.log('Suppression de la photo pour le colis:', colisId);
      
      // Récupérer le token CSRF depuis window.csrf_token
      const csrfToken = (window as any).csrf_token;
      
      // Appeler notre méthode backend pour supprimer la photo
      const response = await fetch('/api/method/log.log.doctype.colis.colis.delete_photo_livraison', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          colis_id: colisId
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Suppression réussie:', result);
        
        if (result && result.message && result.message.success) {
          // Mettre à jour l'interface utilisateur
          setCapturedPhoto(null);
          setLocalColisData(prevData => prevData ? ({
            ...prevData,
            photo_livraison: undefined
          }) : null);
        } else {
          throw new Error(result.message?.message || 'Erreur lors de la suppression');
        }
      } else {
        const errorText = await response.text();
        console.error('Erreur suppression:', errorText);
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de la photo:', error);
      alert('Erreur lors de la suppression de la photo');
    }
  };

  // Fonctions pour l'édition du commentaire
  const startEditingComment = () => {
    setIsEditingComment(true);
  };

  const saveComment = async () => {
    setLocalColisData(prevData => prevData ? ({
      ...prevData,
      commentaire_livreur: commentText
    }) : null);
    setIsEditingComment(false);
    
    // Sauvegarder le commentaire dans Frappe
    await saveToBackend({
      commentaire_livreur: commentText
    });
  };

  const cancelEditComment = () => {
    setCommentText(localColisData?.commentaire_livreur || '');
    setIsEditingComment(false);
  };

  // Fonction pour sauvegarder les modifications
  const saveQuantity = async (articleId: string) => {
    if (!localColisData || editingArticle !== articleId) {
      console.log('Cannot save: no data or wrong article being edited');
      return;
    }
    
    console.log('Saving quantity for article:', articleId, 'with value:', tempQuantities[articleId]);
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map((article, index) => {
        const articleKey = article.id || `article-${index}`;
        if (articleKey === articleId) {
          const newQuantiteLivree = Math.min(tempQuantities[articleId] || 0, article.quantite_totale);
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
            date_derniere_livraison: new Date().toISOString().slice(0, 19).replace('T', ' ')
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

      const updatedData = {
        ...prevData,
        articles: updatedArticles,
        status: newGlobalStatus
      };
      
      // Sauvegarder les modifications dans Frappe de manière asynchrone
      saveToBackend({
        articles: updatedData.articles,
        status: updatedData.status
      });
      
      return updatedData;
    });
    
    console.log('Finished saving quantity for article:', articleId);
    setEditingArticle(null);
    setTempQuantities({});
  };

  // Fonction pour marquer toute la quantité comme livrée
  const markAllAsDelivered = async (articleId: string) => {
    if (!localColisData) return;
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map((article, index) => {
        const articleKey = article.id || `article-${index}`;
        if (articleKey === articleId) {
          return {
            ...article,
            quantite_livree: article.quantite_totale,
            quantite_restante: 0,
            statut_article: 'Livré',
            date_derniere_livraison: new Date().toISOString().slice(0, 19).replace('T', ' ')
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

      const updatedData = {
        ...prevData,
        articles: updatedArticles,
        status: newGlobalStatus,
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      
      // Sauvegarder les modifications dans Frappe de manière asynchrone
      saveToBackend({
        articles: updatedData.articles,
        status: updatedData.status,
        date_derniere_livraison: updatedData.date_derniere_livraison
      });
      
      return updatedData;
    });
  };

  // Fonction pour marquer tous les articles comme livrés
  const markAllArticlesAsDelivered = async () => {
    if (!localColisData) return;
    
    setLocalColisData(prevData => {
      if (!prevData) return null;
      const updatedArticles = prevData.articles.map(article => ({
        ...article,
        quantite_livree: article.quantite_totale,
        quantite_restante: 0,
        statut_article: 'Livré',
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }));

      const updatedData = {
        ...prevData,
        articles: updatedArticles,
        status: 'Livré',
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      
      // Sauvegarder les modifications dans Frappe de manière asynchrone
      saveToBackend({
        articles: updatedData.articles,
        status: updatedData.status,
        date_derniere_livraison: updatedData.date_derniere_livraison
      });
      
      return updatedData;
    });
  };

  // État pour gérer le chargement de la mise à jour du statut
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);



    // Fonction pour mettre à jour le statut du colis
  const updateColisStatus = async (newStatus: string) => {
    if (!localColisData || !colisId) return;
    
    setIsUpdatingStatus(true);
    try {
      // Utiliser l'API Frappe standard pour mettre à jour le statut
      const result = await updateColis('Colis', colisId, {
        status: newStatus
      });
      
      console.log('Résultat mise à jour:', result);
      
      // Mettre à jour les données locales
      setLocalColisData(prevData => {
        if (!prevData) return null;
        return {
          ...prevData,
          status: newStatus
        };
      });
      
      // Rafraîchir les données depuis le serveur
      mutateColisData();
      
                    // Note: Les commentaires sont automatiquement enregistrés par Frappe lors des modifications
       // L'historique des changements est visible dans l'interface Frappe native
      
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      alert('Erreur lors de la mise à jour du statut');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Fonction pour obtenir les statuts disponibles selon le statut actuel
  const getAvailableStatuses = (currentStatus: string) => {
    const statusFlow: { [key: string]: string[] } = {
      'Nouveau': ['Préparé'],
      'Préparé': ['Nouveau', 'Enlevé'],
      'Enlevé': ['Préparé', 'Partiellement Livré', 'Livré'],
      'Partiellement Livré': ['Enlevé', 'Livré'],
      'Livré': ['Partiellement Livré'],
      'Non Livré': ['Enlevé'],
      'Annulé': ['Nouveau']
    };
    
    return statusFlow[currentStatus] || [];
  };

  // Fonction pour vérifier si on peut livrer (statut doit être "Enlevé" ou "Partiellement Livré")
  const canDeliver = () => {
    return localColisData?.status === 'Enlevé' || localColisData?.status === 'Partiellement Livré';
  };

  // Debug: Afficher l'ID du colis
  console.log('ColisDetails - colisId:', colisId);
  console.log('ColisDetails - localColisData:', localColisData);

  // Gestion des états de chargement et d'erreur
  if (isLoading) {
    return (
      <div className="w-full p-4">
        <div className="w-full max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
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
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <Flex align="center" justify="between" mb="4">
            <div>
              <Heading size="7" style={{ color: '#1e293b' }}>
                Colis {localColisData.custom_numero_sequence}
              </Heading>
              <Flex align="center" gap="3" mt="2">
                <Text size="3" style={{ color: '#64748b' }}>
                  {localColisData.id}
                </Text>
                <Badge size="2" color={getStatusColor(localColisData.status) as any}>
                  {localColisData.status}
                </Badge>
              </Flex>
              {isSaving && (
                <Text size="2" style={{ color: '#3b82f6', fontStyle: 'italic' }}>
                  💾 Sauvegarde en cours...
                </Text>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {/* Statuts précédents (rouge) */}
                {getAvailableStatuses(localColisData.status)
                  .filter(status => {
                    const statusOrder = ['Nouveau', 'Préparé', 'Enlevé', 'Partiellement Livré', 'Livré'];
                    const currentIndex = statusOrder.indexOf(localColisData.status);
                    const statusIndex = statusOrder.indexOf(status);
                    return statusIndex < currentIndex;
                  })
                  .map((status) => (
                    <Button
                      key={status}
                      size="1"
                      variant="outline"
                      onClick={() => updateColisStatus(status)}
                      disabled={isSaving}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        opacity: isSaving ? 0.6 : 1,
                        borderColor: '#dc2626',
                        color: '#dc2626'
                      }}
                    >
                      ← {status}
                    </Button>
                  ))}
                
                {/* Statuts suivants (vert) */}
                {getAvailableStatuses(localColisData.status)
                  .filter(status => {
                    const statusOrder = ['Nouveau', 'Préparé', 'Enlevé', 'Partiellement Livré', 'Livré'];
                    const currentIndex = statusOrder.indexOf(localColisData.status);
                    const statusIndex = statusOrder.indexOf(status);
                    return statusIndex > currentIndex;
                  })
                  .map((status) => (
                    <Button
                      key={status}
                      size="1"
                      variant="outline"
                      onClick={() => updateColisStatus(status)}
                      disabled={isSaving}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        opacity: isSaving ? 0.6 : 1,
                        borderColor: '#16a34a',
                        color: '#16a34a'
                      }}
                    >
                      → {status}
                    </Button>
                  ))}
              </div>
            </div>
          </Flex>
          
          <Separator size="4" mb="4" />
          
          {/* Informations générales */}


          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <Card className="p-4">
              <Flex align="center" gap="3" mb="2">
                <FileTextIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
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
                <FileTextIcon className="w-5 h-5" style={{ color: '#3b82f6' }} />
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
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Articles ({localColisData.articles.length})
          </Heading>
          
          <div className="overflow-x-auto" style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <Table.Root>
              <Table.Header>
                <Table.Row style={{ backgroundColor: '#1e293b' }}>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Article</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Action</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Qté Totale</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Qté Livrée</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Qté Restante</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Statut</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Mise à jour</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              
              <Table.Body>
                {localColisData.articles.map((article, index) => {
                  // Créer un identifiant unique pour chaque article
                  const articleKey = article.id || `article-${index}`;
                  
                  return (
                    <Table.Row 
                      key={articleKey}
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
                        {article.quantite_restante > 0 && canDeliver() && (
                          <Button
                            size="1"
                            onClick={() => markAllAsDelivered(articleKey)}
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
                        {article.quantite_restante > 0 && !canDeliver() && (
                          <Text size="1" style={{ color: '#f59e0b', fontSize: '10px' }}>
                            ⚠️
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="3">{article.quantite_totale}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex align="center" gap="2">
                          {editingArticle === articleKey ? (
                            <Flex align="center" gap="2">
                              <TextField.Root
                                size="1"
                                style={{ width: '80px' }}
                                type="number"
                                min="0"
                                max={article.quantite_totale}
                                value={(tempQuantities[articleKey] || 0).toString()}
                                onChange={(e) => setTempQuantities(prev => ({
                                  ...prev,
                                  [articleKey]: parseInt(e.target.value) || 0
                                }))}
                              />
                              <Button
                                size="1"
                                onClick={() => saveQuantity(articleKey)}
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
                              {canDeliver() && (
                                <Button
                                  size="1"
                                  variant="ghost"
                                  onClick={() => startEditing(articleKey, article.quantite_livree)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <Pencil1Icon className="w-3 h-3" />
                                </Button>
                              )}
                            </Flex>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text 
                          size="3" 
                          style={{ 
                            color: article.quantite_restante !== 0 ? '#ef4444' : 'inherit' 
                          }}
                        >
                          {article.quantite_restante}
                        </Text>
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
                  );
                })}
              </Table.Body>
            </Table.Root>
          </div>
          
          {/* Résumé des totaux */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Text size="3" weight="medium" style={{ color: '#374151' }}>
                Quantité totale :
              </Text>
              <Text size="3" weight="bold" style={{ color: '#1e293b' }}>
                {localColisData.articles.reduce((total, article) => total + article.quantite_totale, 0)} unités
              </Text>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="mt-4 flex justify-center gap-4">
            {localColisData.articles.some(article => article.quantite_restante > 0) && canDeliver() && (
              <Button 
                size="3"
                onClick={markAllArticlesAsDelivered}
                disabled={isSaving}
                style={{ 
                  backgroundColor: '#16a34a', 
                  color: 'white',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  padding: '12px 24px'
                }}
              >
                <CheckIcon className="w-4 h-4" />
                Marquer comme livré
              </Button>
            )}
            

          </div>
        </div>

        {/* Informations de livraison */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <Heading size="5" mb="4" style={{ color: '#1e293b' }}>
            Informations de livraison
          </Heading>
          
          <div className="flex justify-center mb-6">
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
                      onClick={selectFromGallery}
                      style={{ cursor: 'pointer', borderColor: '#3b82f6', color: '#3b82f6' }}
                    >
                      📁 Galerie
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
                  <Flex gap="2" mt="2" justify="center">
                    <Button 
                      size="2" 
                      onClick={startCamera}
                      style={{ cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}
                    >
                      <CameraIcon className="w-4 h-4" />
                      Prendre une photo
                    </Button>
                    <Button 
                      size="2" 
                      variant="outline"
                      onClick={selectFromGallery}
                      style={{ cursor: 'pointer', borderColor: '#3b82f6', color: '#3b82f6' }}
                    >
                      📁 Sélectionner depuis la galerie
                    </Button>
                  </Flex>
                </div>
              )}
            </Box>
          </div>
          
          {/* Commentaire */}
          <div>
            <Text size="3" weight="medium" mb="2" style={{ color: '#374151' }}>
              Commentaire
            </Text>
            
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
    </div>
  );
};

export default ColisDetails;