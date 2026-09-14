# Scan & Go — PWA de numérisation locale

Scanner de documents sans publicité, conçu pour fonctionner comme une PWA et conserver les documents **localement dans le navigateur**.

## Fonctions de cette V1

- 📷 Caméra arrière avec qualité élevée
- 🖼️ Import depuis la galerie
- 🔎 Détection automatique du plus grand quadrilatère avec OpenCV.js
- 📐 Correction de perspective
- 🧾 Amélioration de lisibilité / contraste
- 📑 Multi-pages
- 📄 Génération de PDF côté appareil avec PDF-LIB
- 💾 Stockage local via IndexedDB
- 📤 Partage natif via Web Share API quand le navigateur le permet
- ⬇️ Téléchargement direct du PDF en secours
- 🔒 Aucun serveur applicatif et aucun compte
- 📱 Installation comme PWA

## AirDrop

Une PWA ne possède pas une API AirDrop directe. Sur iPhone/iPad, le bouton **Partager** appelle la feuille de partage native lorsque le navigateur l'autorise. AirDrop apparaît alors parmi les destinations disponibles.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub.
2. Mettre tous les fichiers du dossier à la racine du dépôt.
3. Dans **Settings → Pages**, choisir **Deploy from a branch**, branche `main`, dossier `/root`.
4. Ouvrir l'URL HTTPS fournie par GitHub.
5. Sur iPhone : Safari → Partager → **Sur l'écran d'accueil**.

La caméra nécessite HTTPS (GitHub Pages convient).

## Important : bibliothèques externes

La première ouverture utilise :
- OpenCV.js pour la détection/correction des documents ;
- PDF-LIB pour les PDF ;
- Tesseract.js est inclus pour préparer une future fonction OCR.

Le service worker met en cache les bibliothèques après leur chargement afin d'améliorer le fonctionnement hors connexion.

## Stockage

Les documents sont dans IndexedDB, donc dans le stockage local du navigateur/appareil. La capacité exacte dépend du navigateur et du système. Il est recommandé d'exporter les documents importants.

## Limites connues de la V1

- La détection automatique est basée sur le plus grand contour quadrilatère : elle fonctionne particulièrement bien avec une feuille contrastée sur un fond distinct.
- Certains navigateurs mobiles peuvent limiter la caméra, le partage de fichiers ou le stockage PWA.
- Pour une qualité « scanner professionnel », une V2 peut ajouter : détection en temps réel avec surimpression des quatre coins, recadrage manuel, filtres N&B/gris/couleur, rotation, réorganisation des pages par glisser-déposer, OCR local, recherche dans les documents, partage par e-mail avec composition, impression, Web Share Target et File System Access API.

## Licence

Projet libre à adapter pour un usage personnel ou pédagogique.

## Identité visuelle

Le logo de l'application est inclus dans `assets/logo-scan-go.png`.
Les versions PWA `192x192` et `512x512` sont déjà générées dans `icons/` et référencées par le manifeste.

## Flux de numérisation

Le parcours principal est volontairement explicite :

**Prendre une photo → Recadrer → Utiliser la page → Ajouter une page ou Créer le PDF → Partager**

Si l'accès caméra intégré du navigateur est refusé ou indisponible, l'application bascule sur le sélecteur caméra natif du téléphone. Sur iPhone, cela permet de prendre la photo avec l'appareil photo du système puis de revenir dans l'étape de recadrage.
