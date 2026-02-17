// renderer/renderer.js
const path = require('path');
const fs = require('fs');
const { ipcRenderer, shell } = require('electron');

// --- IMPORTS ---
const fileManager = require('./fileManager');
const zolaManager = require('./zolaManager');
const formBuilder = require('./formBuilder');
const validators = require('./validators');
const gitManager = require('./gitManager');
const ftpManager = require('./ftpManager');
const githubManager = require('./githubManager');

// Imports des modules de la feature "Création de page"
const creerNouvellePageUI = require('./uiActions');

const {
    parseMarkdownToAst,
    astToMarkdown,
    insertHeadingAst,
    insertParagraphAst,
    insertBlockquoteAst,
    insertListAst,
    insertCodeBlockAst,
    insertImageAst,
    insertVideoAst
} = require('./markdownAst');

// --- VARIABLES ---
let currentProjectDir = null;
let currentFilePath = null;
let formatActuel = 'yaml';
let currentAst = null;

// --- FIX FOCUS ---
window.addEventListener('click', () => {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        window.focus();
    }
});

// ============================================================
// 1. GESTION PROJET
// ============================================================

async function choisirDossier() {
    const cheminDossier = await ipcRenderer.invoke('dialog:openDirectory');
    if (cheminDossier) {
        currentProjectDir = cheminDossier;
        chargerListeFichiers();

        // Init Git
        gitManager.chargerHistorique(currentProjectDir, (hash) => {
            voirVersionRelais(hash);
        });

        const btn = document.querySelector('.sidebar-actions .btn-primary');
        if (btn) btn.innerText = "📂 " + path.basename(cheminDossier);

        afficherMessage("Dossier chargé avec succès !", false);
    }
}

function chargerListeFichiers() {
    const sidebar = document.getElementById('file-list');
    sidebar.innerHTML = '';
    if (!currentProjectDir) return;

    const tree = fileManager.getFileTree(currentProjectDir);

    function renderTree(obj, container, depth = 0) {
        // 1. D'abord on affiche les fichiers du dossier actuel
        if (obj._files) {
            obj._files.forEach(file => {
                const div = document.createElement('div');
                div.innerText = "📄 " + file.name;
                div.style.paddingLeft = (depth * 15 + 20) + 'px';
                div.style.cursor = 'pointer';
                div.style.fontSize = '13px';
                div.onclick = () => ouvrirFichier(file.fullPath);
                container.appendChild(div);
            });
        }

        // 2. Ensuite on traite les sous-dossiers
        for (const key in obj) {
            if (key === '_files') continue;

            const folderDiv = document.createElement('div');
            folderDiv.innerHTML = `<strong>📁 ${key}</strong>`;
            folderDiv.style.paddingLeft = (depth * 15 + 10) + 'px';
            folderDiv.style.backgroundColor = '#1a252f';
            folderDiv.style.paddingTop = '5px';
            folderDiv.style.paddingBottom = '5px';
            container.appendChild(folderDiv);

            renderTree(obj[key], container, depth + 1);
        }
    }

    renderTree(tree, sidebar);
}

// ============================================================
// 2. OUVERTURE FICHIER
// ============================================================

function ouvrirFichier(chemin) {
    currentFilePath = chemin;
    const { data, content, format } = fileManager.parseMarkdownFile(chemin);
    formatActuel = format;

    try {
        currentAst = parseMarkdownToAst(content);
    } catch (e) {
        console.error(e);
        afficherMessage("Erreur lecture contenu (AST)", true);
        currentAst = { type: 'root', children: [] };
    }

    genererFormulaire(data);
}

// ============================================================
// 3. GÉNÉRATION FORMULAIRE
// ============================================================

function rafraichirInterface(frontMatter) {
    genererFormulaire(frontMatter);
}

function genererFormulaire(frontMatter) {
    const container = document.getElementById('form-container');

    const callbacks = {
        onImportImage: (inputId, previewId) => importerMedia(inputId, previewId, 'image'),
        onImportVideo: (inputId, previewId) => importerMedia(inputId, previewId, 'video'),

        nodeToMarkdown: (node) => {
            try { return astToMarkdown({ type: 'root', children: [node] }).trim(); } catch (e) { return ""; }
        },

        onAddHeading: (level, text) => { insertHeadingAst(currentAst, level, text); rafraichirInterface(frontMatter); },
        onAddParagraph: (text) => { insertParagraphAst(currentAst, text); rafraichirInterface(frontMatter); },
        onAddBlockquote: (text) => { insertBlockquoteAst(currentAst, text); rafraichirInterface(frontMatter); },
        onAddList: () => { insertListAst(currentAst); rafraichirInterface(frontMatter); },
        onAddCode: () => { insertCodeBlockAst(currentAst); rafraichirInterface(frontMatter); },
        onAddImageBlock: () => { insertImageAst(currentAst); rafraichirInterface(frontMatter); },
        onAddVideoBlock: () => { insertVideoAst(currentAst); rafraichirInterface(frontMatter); },

        onUpdateBlock: (index, newValue, mode) => {
            if (!currentAst || !currentAst.children[index]) return;
            const node = currentAst.children[index];

            if (mode === 'raw') {
                try {
                    const miniAst = parseMarkdownToAst(newValue);
                    if (miniAst.children && miniAst.children.length > 0) {
                        currentAst.children[index] = miniAst.children[0];
                    }
                } catch (e) { console.warn("Erreur parsing raw", e); }

            } else if (mode === 'blockquote') {
                if (!node.children || node.children.length === 0) {
                    node.children = [{ type: 'paragraph', children: [] }];
                }
                const pNode = node.children[0];
                pNode.children = [{ type: 'text', value: newValue }];

            } else if (mode === 'image') {
                let imgNode = node;
                if (node.type === 'paragraph' && node.children && node.children[0].type === 'image') {
                    imgNode = node.children[0];
                }
                if (newValue.url !== undefined) imgNode.url = newValue.url;
                if (newValue.alt !== undefined) imgNode.alt = newValue.alt;

            } else if (mode === 'video') {
                node.value = newValue;

            } else {
                if (node.children && node.children.length > 0) {
                    node.children[0].value = newValue;
                } else {
                    node.children = [{ type: 'text', value: newValue }];
                }
            }
        },

        onMoveBlock: (fromIndex, toIndex) => {
            if (fromIndex === toIndex) return;
            const [movedItem] = currentAst.children.splice(fromIndex, 1);
            currentAst.children.splice(toIndex, 0, movedItem);
            rafraichirInterface(frontMatter);
        },

        onDeleteBlock: (index) => {
            currentAst.children.splice(index, 1);
            rafraichirInterface(frontMatter);
        }
    };

    formBuilder.generateForm(container, frontMatter, currentAst, null, callbacks, currentProjectDir);
}

// ============================================================
// 4. IMPORTS MÉDIA
// ============================================================

async function importerMedia(inputId, previewId, type) {
    if (!currentProjectDir) {
        afficherMessage("Veuillez charger un projet d'abord.", true);
        return;
    }

    const action = type === 'video' ? 'dialog:openVideo' : 'dialog:openImage';
    const cheminSource = await ipcRenderer.invoke(action);

    if (!cheminSource) return;

    const subFolder = type === 'video' ? 'videos' : 'images';
    const dossierCible = path.join(currentProjectDir, 'static', subFolder);

    if (!fs.existsSync(dossierCible)) {
        fs.mkdirSync(dossierCible, { recursive: true });
    }

    const nomFichier = path.basename(cheminSource);
    const cheminDestination = path.join(dossierCible, nomFichier);

    try {
        fs.copyFileSync(cheminSource, cheminDestination);
        const cheminZola = `/${subFolder}/${nomFichier}`;

        const input = document.getElementById(inputId);
        if (input) {
            input.value = cheminZola;
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
        }

        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = `file://${cheminDestination}`;
            preview.style.display = 'block';
        }
        afficherMessage("Média importé avec succès !", false);
    } catch (err) {
        afficherMessage(`Erreur copie : ${err.message}`, true);
    }
}

// ============================================================
// 5. SAUVEGARDE
// ============================================================

function sauvegarder() {
    if (!currentFilePath) {
        afficherMessage("Aucun fichier ouvert.", true);
        return;
    }

    const schema = JSON.parse(document.getElementById('form-container').dataset.schema);
    const newConfig = {};

    schema.forEach(item => {
        const inputId = `field-${item.context}-${item.key}`;
        const input = document.getElementById(inputId);
        if (!input) return;

        let val;
        if (input.type === 'checkbox') val = input.checked;
        else if (input.value.includes(',') && item.key !== 'title') {
            val = input.value.split(',').map(s => s.trim());
        } else {
            val = input.value.trim();
        }

        if (item.context === 'extra') {
            if (!newConfig.extra) newConfig.extra = {};
            newConfig.extra[item.key] = val;
        } else {
            newConfig[item.key] = val;
        }
    });

    const validation = validators.validerFormulaire(newConfig);
    if (!validation.isValid) {
        afficherMessage(validation.error, true);
        return;
    }

    let newContent = "";
    try {
        newContent = astToMarkdown(currentAst);
    } catch (e) {
        afficherMessage("Erreur conversion contenu : " + e.message, true);
        return;
    }

    try {
        fileManager.saveMarkdownFile(currentFilePath, newConfig, newContent, formatActuel);
        afficherMessage("Sauvegarde réussie !", false);
    } catch (e) {
        afficherMessage("Erreur écriture fichier : " + e.message, true);
    }
}

// ============================================================
// 6. UTILITAIRES & EXPORTS
// ============================================================

function afficherMessage(texte, estErreur) {
    const msgDiv = document.getElementById('status-message');
    if (!msgDiv) return;
    msgDiv.innerText = texte;
    msgDiv.style.display = 'block';
    if (estErreur) {
        msgDiv.style.backgroundColor = '#f8d7da';
        msgDiv.style.color = '#721c24';
        msgDiv.style.border = '1px solid #f5c6cb';
    } else {
        msgDiv.style.backgroundColor = '#d4edda';
        msgDiv.style.color = '#155724';
        msgDiv.style.border = '1px solid #c3e6cb';
        setTimeout(() => { msgDiv.style.display = 'none'; }, 3000);
    }
}

function lancerZola() {
    if (!currentProjectDir) return afficherMessage("Chargez un projet d'abord", true);
    const btnLaunch = document.getElementById('btn-launch');
    btnLaunch.innerText = "⏳ ...";
    zolaManager.lancerServeur(currentProjectDir, (erreurMessage) => {
        afficherMessage(`Erreur Zola : ${erreurMessage}`, true);
        arreterZola();
    });
    setTimeout(() => {
        btnLaunch.style.display = 'none';
        document.getElementById('btn-stop').style.display = 'block';
        btnLaunch.innerText = "▶️ Prévisualiser (Serveur)";
        afficherMessage("Serveur Zola lancé !", false);
    }, 1000);
}

function arreterZola() {
    zolaManager.arreterServeur();
    document.getElementById('btn-launch').style.display = 'block';
    document.getElementById('btn-stop').style.display = 'none';
    afficherMessage("Serveur arrêté.", false);
}

function genererSite() {
    if (!currentProjectDir) return afficherMessage("Chargez un projet d'abord", true);
    document.getElementById('custom-prompt').classList.add('visible');
    document.getElementById('prompt-input').focus();
}

function fermerPrompt() {
    document.getElementById('custom-prompt').classList.remove('visible');
    document.getElementById('prompt-input').value = '';
}

function confirmerGeneration() {
    const nomDossier = document.getElementById('prompt-input').value;
    if (!nomDossier || nomDossier.trim() === "") return afficherMessage("Le nom ne peut pas être vide", true);
    fermerPrompt();
    const nomNettoye = nomDossier.replace(/[^a-zA-Z0-9-_]/g, '_');

    // Chemin relatif correct pour remonter de 'renderer' vers la racine puis 'rendu_genere'
    const dossierExportsRacine = path.join(__dirname, '../../rendu_genere');

    const dossierSortie = path.join(dossierExportsRacine, nomNettoye);
    if (!fs.existsSync(dossierExportsRacine)) fs.mkdirSync(dossierExportsRacine);
    if (fs.existsSync(dossierSortie)) return afficherMessage(`Le dossier "${nomNettoye}" existe déjà.`, true);
    afficherMessage("Génération en cours...", false);
    zolaManager.buildSite(currentProjectDir, dossierSortie, (error, stderr) => {
        if (error) afficherMessage(`Erreur génération : ${stderr}`, true);
        else afficherMessage(`Site généré dans : ${nomNettoye}`, false);
    });
}

function nouvelleSauvegarde() {
    gitManager.nouvelleSauvegarde(currentProjectDir, afficherMessage, () => {
        gitManager.chargerHistorique(currentProjectDir, (h) => voirVersionRelais(h));
    });
}

function pushSite() { gitManager.pushToRemote(currentProjectDir, afficherMessage); }

function revenirAuPresent() {
    gitManager.revenirAuPresent(currentProjectDir, {
        afficherMessage: afficherMessage,
        reloadUI: () => {
            chargerListeFichiers();
            if (currentFilePath) ouvrirFichier(currentFilePath);
            gitManager.chargerHistorique(currentProjectDir, (h) => voirVersionRelais(h));
        }
    });
}

function voirVersionRelais(hash) {
    gitManager.voirVersion(hash, currentProjectDir, {
        afficherMessage: afficherMessage,
        reloadUI: () => {
            chargerListeFichiers();
            if (currentFilePath) ouvrirFichier(currentFilePath);
        }
    });
}

// ============================================================
// 7. AJOUT DE PAGE (NOUVELLE FONCTIONNALITÉ)
// ============================================================
const templateEngine = require('./templateEngine');

window.creerNouvellePage = () => {
    if (!currentProjectDir) return alert("Veuillez charger un projet.");

    // 1. Lister les dossiers
    const contentPath = path.join(currentProjectDir, 'content');
    const getSubDirs = (dir) => fs.readdirSync(dir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

    const folders = ["(Racine)", ...getSubDirs(contentPath)];
    document.getElementById('new-page-folder').innerHTML = folders.map(f => `<option value="${f}">${f}</option>`).join('');

    // 2. Lister les templates du site
    const templatesDir = path.join(currentProjectDir, 'templates');
    const templates = templateEngine.getTemplates(templatesDir);

    const templateSelect = document.getElementById('new-page-template');
    templateSelect.innerHTML = templates.map(t => `<option value="${t.id}">${t.label}</option>`).join('');

    document.getElementById('modal-container').style.display = 'flex';

    // Charger les champs du premier template par défaut
    updateTemplateFields();
};

window.updateTemplateFields = () => {
    const templateName = document.getElementById('new-page-template').value;
    const fileName = document.getElementById('new-page-filename').value.trim();
    const container = document.getElementById('template-fields-container');

    if (!templateName) return;

    const templatePath = path.join(currentProjectDir, 'templates', templateName);
    const analysis = templateEngine.analyseTemplate(templatePath);
    const allVars = [...analysis.pageVars, ...analysis.extraVars];
    
    if (container.dataset.currentTemplate !== templateName) {
        container.innerHTML = '';
        container.dataset.currentTemplate = templateName;
    }

    const today = new Date().toISOString().split('T')[0];

    allVars.forEach(varName => {
        let input = container.querySelector(`[data-key="${varName}"]`);

        // Valeur suggérée par le système
        let suggestedValue = "";
        if (varName === 'date') suggestedValue = today;
        else if (varName === 'title') {
            suggestedValue = fileName ?
                fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) :
                "Nouveau Titre";
        } else if (varName === 'draft') suggestedValue = "false";

        if (!input) {
            // Création du champ s'il n'existe pas encore
            const div = document.createElement('div');
            div.style.marginBottom = "10px";
            div.innerHTML = `
                <label style="display:block; font-size:0.8em; font-weight:bold; color: #555;">${varName.toUpperCase()}</label>
                <input type="text" 
                       class="template-input" 
                       data-key="${varName}" 
                       data-user-edited="false"
                       value="${suggestedValue}" 
                       style="width:100%; padding:8px; border: 1px solid #ddd; border-radius:4px;"
                       oninput="this.dataset.userEdited='true'">
            `;
            container.appendChild(div);
        } else {
            // MISE À JOUR : On ne change la valeur QUE si l'utilisateur n'a pas encore écrit dedans
            if (input.dataset.userEdited === "false") {
                input.value = suggestedValue;
            }
        }
    });
};

async function validerCreationPage() {
    const errorDiv = document.getElementById('new-page-error-msg');
    const fileNameInput = document.getElementById('new-page-filename');
    const fileName = fileNameInput.value.trim();
    const folderChoice = document.getElementById('new-page-folder').value;
    const templateName = document.getElementById('new-page-template').value;

    // Cache l'erreur précédente au début du clic
    errorDiv.style.display = 'none';

    if (!fileName) {
        errorDiv.innerText = "⚠️ Le nom du fichier est requis.";
        errorDiv.style.display = 'block';
        fileNameInput.style.borderColor = '#e74c3c'; // Petit retour visuel sur l'input
        return;
    }

    // Récupérer les valeurs des champs dynamiques
    const values = {};
    document.querySelectorAll('.template-input').forEach(input => {
        values[input.dataset.key] = input.value;
    });

    try {
        const templatePath = path.join(currentProjectDir, 'templates', templateName);
        const analysis = templateEngine.analyseTemplate(templatePath); //

        const markdownContent = templateEngine.generateMarkdown(templateName, analysis, values); //

        const section = folderChoice === "(Racine)" ? "" : folderChoice;
        const targetDir = path.join(currentProjectDir, 'content', section);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const finalPath = path.join(targetDir, `${fileName}.md`);

        if (fs.existsSync(finalPath)) {
            errorDiv.innerText = "❌ Ce fichier existe déjà dans ce dossier.";
            errorDiv.style.display = 'block';
            return;
        }

        fs.writeFileSync(finalPath, markdownContent, 'utf8');

        fermerModalePage();
        chargerListeFichiers(); //
        ouvrirFichier(finalPath); //

        // Notification discrète dans l'appli principale
        afficherMessage("Page créée avec succès !", false); //

    } catch (e) {
        errorDiv.innerText = "🔥 Erreur : " + e.message;
        errorDiv.style.display = 'block';
    }
}

// Pense aussi à réinitialiser le style de l'input quand on ferme la modale
function fermerModalePage() {
    document.getElementById('modal-container').style.display = 'none';
    document.getElementById('new-page-filename').value = '';
    document.getElementById('new-page-filename').style.borderColor = '#ccc';
    document.getElementById('new-page-error-msg').style.display = 'none';
}



// ============================================================
// 8. GESTION FTP
// ============================================================

function openFtpModal() {
    if (!currentProjectDir) {
        afficherMessage("⚠️ Veuillez charger un projet d'abord.", true);
        return;
    }

    // On essaie de pré-remplir avec la config sauvegardée
    const config = ftpManager.loadConfig(currentProjectDir);
    if (config) {
        document.getElementById('ftp-host').value = config.host || '';
        document.getElementById('ftp-user').value = config.user || '';
        document.getElementById('ftp-port').value = config.port || 21;
        document.getElementById('ftp-root').value = config.remoteRoot || '/';
        // Par sécurité, on ne remplit pas le mot de passe automatiquement ou on le stocke
        // Pour cet exemple, on suppose que l'utilisateur le remet, ou on le stocke dans le json (risqué mais pratique)
        document.getElementById('ftp-pass').value = config.password || '';
    }

    document.getElementById('ftp-modal').style.display = 'flex';
}

function closeFtpModal() {
    document.getElementById('ftp-modal').style.display = 'none';
}

async function lancerDeploiement() {
    // 1. Récupérer les infos
    const config = {
        host: document.getElementById('ftp-host').value,
        user: document.getElementById('ftp-user').value,
        password: document.getElementById('ftp-pass').value,
        port: parseInt(document.getElementById('ftp-port').value) || 21,
        remoteRoot: document.getElementById('ftp-root').value
    };

    if (!config.host || !config.user || !config.password) {
        alert("Veuillez remplir tous les champs FTP.");
        return;
    }

    closeFtpModal();
    afficherMessage("⏳ Génération du site avant envoi...", false);

    // 2. Générer le site dans un dossier temporaire
    // On utilise un dossier '_temp_deploy' à la racine du projet
    const tempBuildDir = path.join(currentProjectDir, '_temp_deploy');

    // On sauvegarde la config pour la prochaine fois
    ftpManager.saveConfig(currentProjectDir, config);

    // On lance le build Zola
    zolaManager.buildSite(currentProjectDir, tempBuildDir, async (err, stderr) => {
        if (err) {
            afficherMessage(`❌ Erreur Build : ${stderr}`, true);
            return;
        }

        // 3. Si le build est OK, on lance l'upload FTP
        try {
            await ftpManager.deploy(config, tempBuildDir, afficherMessage);

            // Succès !
            alert("Site mis à ligne avec succès ! 🌍");

            // Nettoyage : on supprime le dossier temporaire (optionnel)
            try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) { }

        } catch (ftpError) {
            // L'erreur est déjà gérée dans le callback afficherMessage via ftpManager
            console.error(ftpError);
        }
    });
}

// ============================================================
// 9. EXPOSITION GLOBALE (Mise à jour)
// ============================================================
// ... vos autres exports ...
window.openFtpModal = openFtpModal;
window.closeFtpModal = closeFtpModal;
window.lancerDeploiement = lancerDeploiement;

// ============================================================
// 10. GESTION GITHUB PAGES
// ============================================================

function configurerGitHub() {
    if (!currentProjectDir) {
        afficherMessage("⚠️ Chargez un projet d'abord.", true);
        return;
    }

    // Vérification si déjà fait
    if (githubManager.isConfigured(currentProjectDir)) {
        const reponse = confirm("GitHub Pages semble déjà configuré (fichier zola.yml détecté).\nVoulez-vous le réécrire ?");
        if (!reponse) return;
    }

    // Création du fichier
    const success = githubManager.setupPages(currentProjectDir, afficherMessage);

    if (success) {
        // --- LE RAPPEL IMPORTANT EST ICI ---
        alert(`✅ Fichier de configuration créé avec succès !

⚠️ ÉTAPE CRUCIALE SUR GITHUB.COM :
Pour que le site fonctionne, vous devez activer "GitHub Actions" sur le site web :

1. Allez sur votre dépôt GitHub > onglet 'Settings'.
2. Cliquez sur 'Pages' (menu de gauche).
3. Dans la section 'Build and deployment', changez la Source.
   👉 Sélectionnez : "GitHub Actions".

Une fois cela fait :
1. Revenez ici et cliquez sur '💾 Sauvegarder l'état'.
2. Cliquez sur '☁️ Publier sur Internet'.`);

        // On lance la sauvegarde automatiquement pour gagner du temps
        nouvelleSauvegarde();
    }
}

// ============================================================
// 11. EXPORTS GLOBAUX
// ============================================================

window.choisirDossier = choisirDossier;
window.sauvegarder = sauvegarder;
window.lancerZola = lancerZola;
window.arreterZola = arreterZola;
window.genererSite = genererSite;
window.fermerPrompt = fermerPrompt;
window.confirmerGeneration = confirmerGeneration;
window.nouvelleSauvegarde = nouvelleSauvegarde;
window.revenirAuPresent = revenirAuPresent;
window.pushSite = pushSite;
window.configurerGitHub = configurerGitHub;
window.fermerModalePage = fermerModalePage;
window.validerCreationPage = validerCreationPage;

// Exports pour les modules externes (feature camarade)
window.getCurrentProjectDir = () => currentProjectDir;
window.chargerListeFichiers = chargerListeFichiers;
window.ouvrirFichier = ouvrirFichier;