---
title: "Documentation Technique"
date: 2026-02-02
template: "page.html"
---

<p class="lead">L'application est une solution de bureau (Desktop) développée avec <strong>Electron.js</strong>. Elle permet de piloter le moteur Zola localement et d'automatiser des tâches complexes (création de pages, versioning, déploiement) via une interface modulaire.</p>

<hr class="spacer">

<h2>1. Architecture Modulaire & Intelligence</h2>
<p>Le code JavaScript a été entièrement restructuré pour séparer la logique en plusieurs modules spécialisés :</p>

<div class="grid-3">
    <div class="card">
        <div class="tech-icon">⚙️</div> 
        <h3>Template Engine</h3>
        <p>Ce module scanne les fichiers HTML de Zola, utilise des expressions régulières pour extraire les variables Twig (<code>page.extra</code>), et génère automatiquement un fichier de configuration YAML. Les formulaires s'adaptent ainsi tout seuls au design !</p>
    </div>
    <div class="card">
        <div class="tech-icon">🌳</div> 
        <h3>Manipulation AST</h3>
        <p>Le Markdown n'est plus traité comme du simple texte. Il est converti en Arbre Syntaxique (AST) avec la librairie <code>unified</code>. Cela permet d'injecter des blocs avancés (comme du HTML brut pour les <strong>Carrousels</strong>) sans casser la structure du document.</p>
    </div>
    <div class="card">
        <div class="tech-icon">⏳</div> 
        <h3>Git Manager</h3>
        <p>L'application exécute des commandes Git natives en arrière-plan via <code>child_process</code>. L'utilisateur peut sauvegarder des versions, naviguer dans l'historique et restaurer d'anciennes modifications sans jamais ouvrir un terminal.</p>
    </div>
</div>

<hr class="spacer">

<div class="split-layout">
    <div>
        <h2>2. Déploiement Multi-Cibles</h2>
        <p>Pour mettre le site en ligne, l'application propose deux pipelines distincts :</p>
        <ul class="mission-list">
            <li><strong>Serveur FTP classique :</strong> L'application exécute <code>zola build</code> dans un dossier temporaire, se connecte au serveur via <code>basic-ftp</code>, nettoie le répertoire distant et transfère les fichiers compilés.</li>
            <li><strong>Intégration Continue (GitHub) :</strong> L'application génère automatiquement un workflow <code>zola.yml</code>. Lors du clic sur "Publier" (Git Push), ce sont les serveurs de GitHub qui compilent et hébergent le site.</li>
        </ul>
    </div>
    <div>
        <div class="highlight-box" style="border-left-color: #e74c3c; background-color: #fadbd8;">
            <h3 style="color: #c0392b;">⚠️ Attention : Configuration GitHub Pages</h3>
            <p style="color: #333; font-size: 0.95em;">Si vous utilisez le bouton <strong>"Configurer GitHub Pages"</strong> dans l'application, une manipulation manuelle unique est indispensable sur le site web de GitHub pour autoriser l'affichage :</p>
            <ol style="margin-top: 10px; font-weight: bold; color: #c0392b; font-size: 0.9em;">
                <li>Allez dans l'onglet <em>Settings</em> de votre dépôt GitHub.</li>
                <li>Cliquez sur <em>Pages</em> dans le menu de gauche.</li>
                <li>Dans la section "Build and deployment", modifiez la <strong>Source</strong> pour choisir <strong>"GitHub Actions"</strong>.</li>
            </ol>
        </div>
    </div>
</div>

<hr class="spacer">

<h2 style="text-align:center; margin-bottom: 30px;">Démonstrations</h2>

<div class="video-grid">
    <div class="video-card">
        <h3>1. Interface et Création de Page</h3>
        <p style="font-size: 0.9em; color: #666;">Détection automatique des templates et génération du formulaire associé.</p>
    </div>
    <div class="video-card">
        <h3>2. Édition Riche et Carrousel</h3>
        <p style="font-size: 0.9em; color: #666;">Sélection multiple d'images et injection d'un shortcode dynamique.</p>
    </div>
    <div class="video-card">
        <h3>3. Versioning et Déploiement</h3>
        <p style="font-size: 0.9em; color: #666;">Sauvegarde Git (Commit) et publication automatisée (Push / FTP).</p>
    </div>
</div>

<hr class="spacer">

<div style="text-align:center; background-color: #f8f9fa; padding: 40px; border-radius: 8px; border: 1px solid #e9ecef; margin-top: 40px;">
    <h2 style="margin-top: 0; color: #2c3e50;">📥 Ressources Annexes</h2>
    <p style="margin-bottom: 25px;">Vous souhaitez consulter le rapport détaillé du projet, étudier le code source, ou installer l'exécutable généré par Electron Forge ?</p>
    <a href="/projet-tutore/documents/rapport_technique.pdf" download style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; transition: background 0.3s;">
        📄 Télécharger le Rapport (.docx)
    </a>
</div>