---
title: "Stack technique"
date: 2026-03-22
template: "page.html"
---

<hr class="spacer">

<h2>Stack Technique</h2>

<div style="max-width: 900px; margin: 0 auto;">
    <p>
        L’application repose sur une architecture moderne combinant technologies web et outils système.
        Ce choix permet de bénéficier à la fois de la flexibilité du JavaScript et de la puissance
        d’un environnement desktop.
    </p>
</div>

<div class="grid-3">
    <div class="card">
        <h3>🖥️ Frontend</h3>
        <p>
            L’interface utilisateur est développée en HTML, CSS et JavaScript.
            Elle est intégrée dans Electron, ce qui permet de créer une application native
            multiplateforme tout en conservant une base web.
        </p>
        <p>
            L’objectif est de proposer une interface claire, intuitive et réactive,
            adaptée à des utilisateurs non techniques.
        </p>
    </div>

    <div class="card">
        <h3>⚙️ Backend local</h3>
        <p>
            Node.js est utilisé pour gérer les opérations système telles que la manipulation
            des fichiers, l’exécution de commandes et l’interaction avec Git.
        </p>
        <p>
            Cette couche permet d’automatiser des प्रक्रses complexes tout en restant transparente
            pour l’utilisateur final.
        </p>
    </div>

    <div class="card">
        <h3>📦 Écosystème</h3>
        <p>
            Plusieurs bibliothèques sont utilisées pour enrichir les fonctionnalités :
        </p>
        <ul>
            <li><code>unified</code> pour la manipulation AST du Markdown</li>
            <li><code>basic-ftp</code> pour le déploiement sur serveur</li>
            <li><code>child_process</code> pour l’exécution de commandes système</li>
        </ul>
        <p>
            Cet écosystème permet de construire une solution complète et extensible.
        </p>
    </div>
</div>