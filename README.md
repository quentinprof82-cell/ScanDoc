# Scan & Go — PWA scanner local

## Architecture

Application mobile-first, séparée par responsabilités :

- `js/app.js` orchestration et navigation
- `js/camera.js` caméra et capture
- `js/editor.js` recadrage et interaction des coins
- `js/detect.js` OpenCV, détection des 4 coins et perspective
- `js/image.js` préparation et amélioration de l'image
- `js/pdf.js` création PDF et partage
- `js/storage.js` IndexedDB local
- `js/ui.js` écrans caméra / recadrage
- `css/` interface générale, caméra et responsive

## Flux

**Photo → recadrage → validation de la page → autre page ou PDF → partage**

Les commandes essentielles sont ancrées au viewport et prennent en compte les zones sûres iPhone/iPad. Aucun dézoom ne doit être nécessaire.

## Données

Les documents restent dans IndexedDB sur l'appareil. Aucun compte ni serveur de stockage n'est requis.

## Partage

La PWA utilise Web Share avec fichier quand disponible. Sur iOS, la feuille de partage système peut proposer AirDrop, Mail, Messages et les autres destinations installées.

## Déploiement

Déposer le contenu dans un dépôt GitHub puis activer GitHub Pages sur `main`. La caméra nécessite HTTPS.


## Installation sur GitHub

Décompressez ce ZIP puis envoyez **tout le contenu** à la racine du dépôt GitHub
(`index.html`, `css/`, `js/`, `icons/`, `assets/`, etc.). Ne mettez pas le ZIP
lui-même dans le dépôt.

Le workflow `.github/workflows/pages.yml` permet de publier automatiquement le
site avec GitHub Pages après activation de Pages sur GitHub.


## V3 — amélioration du scan
- Détection automatique des coins renforcée (contours + seuil adaptatif + scoring géométrique).
- Capture caméra haute résolution et JPEG haute qualité.
- Correction de perspective plus nette.
- Modes Document N&B, gris et couleur.
- Gestion des scans existants par boutons, sans menu « 1 / 2 / 3 ».
- Parcours multi-pages avec boutons explicites « Ajouter une autre page » / « Terminer et créer le PDF ».


### V7
La capture ouvre désormais immédiatement l'écran de recadrage avant le traitement OpenCV, afin d'éviter les retours à l'accueil sur iPhone.
