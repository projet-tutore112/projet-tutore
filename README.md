# Interface d'Édition pour Zola (CMS Local)

Cette application de bureau (Desktop) est une interface graphique développée avec Electron. Elle agit comme un CMS local pour simplifier la création, l'édition et le déploiement de contenu sur des sites statiques générés par **[Zola](https://www.getzola.org/)**.

Elle est pensée pour les rédacteurs et contributeurs non-techniques, leur permettant de gérer du contenu Markdown sans avoir à toucher à la ligne de commande ou au code source complexe.

---

## Prérequis

Avant de pouvoir installer et lancer l'application, assurez-vous d'avoir les éléments suivants installés sur votre machine :

1. **[Node.js](https://nodejs.org/)** (version LTS recommandée) : Nécessaire pour faire tourner l'environnement Electron.
2. **[Zola](https://www.getzola.org/documentation/getting-started/installation/)** : Le générateur de site statique. 
   > ⚠️ **Important :** L'exécutable `zola` doit être installé et ajouté à la variable d'environnement `PATH` de votre système pour que l'application puisse lancer les commandes de prévisualisation et de build.
3. **[Git](https://git-scm.com/)** *(Optionnel mais recommandé)* : Nécessaire si vous souhaitez utiliser les fonctionnalités de sauvegarde historique et de déploiement vers GitHub Pages.

---

## 🛠️ Installation

1. **Cloner le dépôt :**
   Ouvrez votre terminal et exécutez la commande suivante :
   ```bash
   git clone [https://github.com/VOTRE_NOM/VOTRE_PROJET.git](https://github.com/VOTRE_NOM/VOTRE_PROJET.git)
