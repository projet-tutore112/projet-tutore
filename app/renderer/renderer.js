// renderer/renderer.js
const path = require("path");
const fs = require("fs");
const { ipcRenderer, shell } = require("electron");

// --- IMPORTS ---
const fileManager = require("./fileManager");
const zolaManager = require("./zolaManager");
const formBuilder = require("./formBuilder");
const validators = require("./validators");
const gitManager = require("./gitManager");
const ftpManager = require("./ftpManager");
const githubManager = require("./githubManager");

// Imports des modules de la feature "Création de page"
const creerNouvellePageUI = require("./uiActions");

const {
  parseMarkdownToAst,
  astToMarkdown,
  insertHeadingAst,
  insertParagraphAst,
  insertBlockquoteAst,
  insertListAst,
  insertCodeBlockAst,
  insertImageAst,
  insertVideoAst,
} = require("./markdownAst");

// --- VARIABLES ---
let currentProjectDir = null;
let currentFilePath = null;
let formatActuel = "yaml";
let currentAst = null;

// --- FIX FOCUS ---
window.addEventListener("click", () => {
  if (
    document.activeElement.tagName !== "INPUT" &&
    document.activeElement.tagName !== "TEXTAREA"
  ) {
    window.focus();
  }
});

// ============================================================
// 0. MODALES CUSTOM (Remplace alert et confirm)
// ============================================================

function afficherAlerte(titre, message) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999;";
  const box = document.createElement("div");
  box.style.cssText =
    "background: white; padding: 25px; border-radius: 8px; width: 450px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: sans-serif;";
  box.innerHTML = `
        <h3 style="margin-top: 0; color: #2c3e50;">${titre}</h3>
        <p style="white-space: pre-wrap; color: #333; line-height: 1.5; font-size: 14px;">${message}</p>
        <div style="text-align: right; margin-top: 20px;">
            <button id="btn-alert-ok" style="background: #27ae60; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
        </div>
    `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector("#btn-alert-ok").onclick = () =>
    document.body.removeChild(overlay);
}

function demanderConfirmation(titre, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999;";
    const box = document.createElement("div");
    box.style.cssText =
      "background: white; padding: 25px; border-radius: 8px; width: 450px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: sans-serif;";
    box.innerHTML = `
            <h3 style="margin-top: 0; color: #2c3e50;">${titre}</h3>
            <p style="white-space: pre-wrap; color: #333; line-height: 1.5; font-size: 14px;">${message}</p>
            <div style="text-align: right; margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                <button id="btn-confirm-cancel" style="background: #e74c3c; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Annuler</button>
                <button id="btn-confirm-ok" style="background: #27ae60; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Confirmer</button>
            </div>
        `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector("#btn-confirm-cancel").onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };
    box.querySelector("#btn-confirm-ok").onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };
  });
}

// ============================================================
// 1. GESTION PROJET
// ============================================================

async function choisirDossier() {
  const cheminDossier = await ipcRenderer.invoke("dialog:openDirectory");
  if (cheminDossier) {
    currentProjectDir = cheminDossier;
    chargerListeFichiers();

    // Init Git
    gitManager.chargerHistorique(currentProjectDir, (hash) => {
      voirVersionRelais(hash);
    });

    const btn = document.querySelector(".sidebar-actions .btn-primary");
    if (btn) btn.innerText = "📂 " + path.basename(cheminDossier);

    afficherMessage("Dossier chargé avec succès !", false);
  }
}

function chargerListeFichiers() {
  const sidebar = document.getElementById("file-list");
  sidebar.innerHTML = "";
  if (!currentProjectDir) return;

  const tree = fileManager.getFileTree(currentProjectDir);

  function renderTree(obj, container, depth = 0) {
    // 1. D'abord on affiche les fichiers du dossier actuel
    if (obj._files) {
      obj._files.forEach((file) => {
        const div = document.createElement("div");
        div.innerText = "📄 " + file.name;
        div.style.paddingLeft = depth * 15 + 20 + "px";
        div.style.cursor = "pointer";
        div.style.fontSize = "13px";
        div.onclick = () => ouvrirFichier(file.fullPath);
        container.appendChild(div);
      });
    }

    // 2. Ensuite on traite les sous-dossiers
    for (const key in obj) {
      if (key === "_files") continue;

      const folderDiv = document.createElement("div");
      folderDiv.innerHTML = `<strong>📁 ${key}</strong>`;
      folderDiv.style.paddingLeft = depth * 15 + 10 + "px";
      folderDiv.style.backgroundColor = "#1a252f";
      folderDiv.style.paddingTop = "5px";
      folderDiv.style.paddingBottom = "5px";
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
    currentAst = { type: "root", children: [] };
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
  const container = document.getElementById("form-container");

  const callbacks = {
    onImportImage: (inputId, previewId) =>
      importerMedia(inputId, previewId, "image"),
    onImportVideo: (inputId, previewId) =>
      importerMedia(inputId, previewId, "video"),

    nodeToMarkdown: (node) => {
      try {
        return astToMarkdown({ type: "root", children: [node] }).trim();
      } catch (e) {
        return "";
      }
    },

    onAddHeading: (level, text) => {
      insertHeadingAst(currentAst, level, text);
      rafraichirInterface(frontMatter);
    },
    onAddParagraph: (text) => {
      insertParagraphAst(currentAst, text);
      rafraichirInterface(frontMatter);
    },
    onAddBlockquote: (text) => {
      insertBlockquoteAst(currentAst, text);
      rafraichirInterface(frontMatter);
    },
    onAddList: () => {
      insertListAst(currentAst);
      rafraichirInterface(frontMatter);
    },
    onAddCode: () => {
      insertCodeBlockAst(currentAst);
      rafraichirInterface(frontMatter);
    },
    onAddImageBlock: () => {
      insertImageAst(currentAst);
      rafraichirInterface(frontMatter);
    },
    onAddVideoBlock: () => {
      insertVideoAst(currentAst);
      rafraichirInterface(frontMatter);
    },

    onUpdateBlock: (index, newValue, mode) => {
      if (!currentAst || !currentAst.children[index]) return;
      const node = currentAst.children[index];

      if (mode === "raw") {
        try {
          const miniAst = parseMarkdownToAst(newValue);
          if (miniAst.children && miniAst.children.length > 0) {
            currentAst.children[index] = miniAst.children[0];
          }
        } catch (e) {
          console.warn("Erreur parsing raw", e);
        }
      } else if (mode === "blockquote") {
        if (!node.children || node.children.length === 0) {
          node.children = [{ type: "paragraph", children: [] }];
        }
        const pNode = node.children[0];
        pNode.children = [{ type: "text", value: newValue }];
      } else if (mode === "image") {
        let imgNode = node;
        if (
          node.type === "paragraph" &&
          node.children &&
          node.children[0].type === "image"
        ) {
          imgNode = node.children[0];
        }
        if (newValue.url !== undefined) imgNode.url = newValue.url;
        if (newValue.alt !== undefined) imgNode.alt = newValue.alt;
      } else if (mode === "video") {
        currentAst.children[index] = { type: "html", value: newValue };
      } else {
        if (node.children && node.children.length > 0) {
          node.children[0].value = newValue;
        } else {
          node.children = [{ type: "text", value: newValue }];
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
    },
  };

  formBuilder.generateForm(
    container,
    frontMatter,
    currentAst,
    null,
    callbacks,
    currentProjectDir,
  );
}

// ============================================================
// 4. IMPORTS MÉDIA
// ============================================================

function demanderNomMediaCustom(nomOriginal, extension, type) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            display: flex; justify-content: center; align-items: center; z-index: 9999;
        `;

    const box = document.createElement("div");
    box.style.cssText = `
            background: white; padding: 20px; border-radius: 8px; width: 400px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;

    box.innerHTML = `
            <h3 style="margin-top: 0; color: #2c3e50;">Renommer ${type === "video" ? "la vidéo" : "l'image"}</h3>
            <p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Sans l'extension (${extension})</p>
            <input type="text" id="custom-media-name" value="${nomOriginal}" 
                   style="width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px;">
            <div id="media-error" style="color: #e74c3c; font-size: 0.85em; margin-bottom: 10px; display: none;"></div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="btn-cancel-media" style="padding: 6px 12px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff;">Annuler</button>
                <button id="btn-confirm-media" style="background: #27ae60; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Importer</button>
            </div>
        `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const input = box.querySelector("#custom-media-name");
    input.focus();
    input.select(); // Sélectionne le texte pour le remplacer directement

    const cleanup = () => document.body.removeChild(overlay);

    box.querySelector("#btn-cancel-media").onclick = () => {
      cleanup();
      resolve(null);
    };

    box.querySelector("#btn-confirm-media").onclick = () => {
      const val = input.value.trim();
      if (!val) {
        const err = box.querySelector("#media-error");
        err.innerText = "Le nom ne peut pas être vide.";
        err.style.display = "block";
        input.focus();
        return;
      }
      cleanup();
      resolve(val);
    };

    // Permettre de valider avec Entrée ou annuler avec Échap
    input.onkeyup = (e) => {
      if (e.key === "Enter") box.querySelector("#btn-confirm-media").click();
      if (e.key === "Escape") box.querySelector("#btn-cancel-media").click();
    };
  });
}

async function importerMedia(inputId, previewId, type) {
  if (!currentProjectDir) {
    afficherMessage("Veuillez charger un projet d'abord.", true);
    return;
  }

  const action = type === "video" ? "dialog:openVideo" : "dialog:openImage";
  const cheminSource = await ipcRenderer.invoke(action);

  if (!cheminSource) return;

  const subFolder = type === "video" ? "videos" : "images";
  const dossierCible = path.join(currentProjectDir, "static", subFolder);

  if (!fs.existsSync(dossierCible)) {
    fs.mkdirSync(dossierCible, { recursive: true });
  }

  // --- NOUVEAU : Vérifier si le fichier est DÉJÀ dans le projet ---
  const dossierSource = path.dirname(cheminSource);
  let cheminZola = "";
  let cheminDestination = cheminSource; // Par défaut, on pointe sur le fichier source

  // On compare les chemins (path.normalize évite les bugs Windows/Mac avec les slashs)
  if (path.normalize(dossierSource) === path.normalize(dossierCible)) {
    // Le fichier est DÉJÀ dans static/images ou static/videos !
    const nomFichier = path.basename(cheminSource);
    cheminZola = `/${subFolder}/${nomFichier}`;
    afficherMessage(`Média existant sélectionné : ${nomFichier}`, false);
  } else {
    // --- LOGIQUE D'IMPORTATION CLASSIQUE (Nouveau fichier) ---
    const extension = path.extname(cheminSource);
    const nomOriginal = path.basename(cheminSource, extension);

    const nouveauNom = await demanderNomMediaCustom(
      nomOriginal,
      extension,
      type,
    );

    if (!nouveauNom) {
      afficherMessage("Importation annulée.", false);
      return;
    }

    let nomNettoye = nouveauNom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();

    let nomFichierFinal = nomNettoye + extension;
    cheminDestination = path.join(dossierCible, nomFichierFinal);

    let compteur = 1;
    while (fs.existsSync(cheminDestination)) {
      nomFichierFinal = `${nomNettoye}-${compteur}${extension}`;
      cheminDestination = path.join(dossierCible, nomFichierFinal);
      compteur++;
    }

    try {
      fs.copyFileSync(cheminSource, cheminDestination);
      cheminZola = `/${subFolder}/${nomFichierFinal}`;
      afficherMessage(`Nouveau média importé : ${nomFichierFinal}`, false);
    } catch (err) {
      afficherMessage(`Erreur copie : ${err.message}`, true);
      return; // On arrête là si erreur
    }
  }

  // --- MISE À JOUR DE L'INTERFACE ---
  const input = document.getElementById(inputId);
  if (input) {
    input.value = cheminZola;
    const event = new Event("input", { bubbles: true });
    input.dispatchEvent(event);
  }

  const preview = document.getElementById(previewId);
  if (preview) {
    preview.src = `file://${cheminDestination}`;
    preview.style.display = "block";
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

  const schema = JSON.parse(
    document.getElementById("form-container").dataset.schema,
  );
  const newConfig = {};

  schema.forEach((item) => {
    const inputId = `field-${item.context}-${item.key}`;
    const input = document.getElementById(inputId);
    if (!input) return;

    let val;
        if (input.type === 'checkbox') {
            val = input.checked;
        } 
        else if (input.value.includes(',') && ['taxonomies', 'aliases', 'tags', 'categories'].includes(item.key.toLowerCase())) {
            val = input.value.split(',').map(s => s.trim());
        } 
        else {
            val = input.value.trim();
        }

    if (item.context === "extra") {
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
    fileManager.saveMarkdownFile(
      currentFilePath,
      newConfig,
      newContent,
      formatActuel,
    );
    afficherMessage("Sauvegarde réussie !", false);
  } catch (e) {
    afficherMessage("Erreur écriture fichier : " + e.message, true);
  }
}

// ============================================================
// 6. UTILITAIRES & EXPORTS
// ============================================================

function afficherMessage(texte, estErreur) {
  const msgDiv = document.getElementById("status-message");
  if (!msgDiv) return;
  msgDiv.innerText = texte;
  msgDiv.style.display = "block";
  if (estErreur) {
    msgDiv.style.backgroundColor = "#f8d7da";
    msgDiv.style.color = "#721c24";
    msgDiv.style.border = "1px solid #f5c6cb";
  } else {
    msgDiv.style.backgroundColor = "#d4edda";
    msgDiv.style.color = "#155724";
    msgDiv.style.border = "1px solid #c3e6cb";
    setTimeout(() => {
      msgDiv.style.display = "none";
    }, 3000);
  }
}

function lancerZola() {
  if (!currentProjectDir)
    return afficherMessage("Chargez un projet d'abord", true);
  const btnLaunch = document.getElementById("btn-launch");
  btnLaunch.innerText = "⏳ ...";
  zolaManager.lancerServeur(currentProjectDir, (erreurMessage) => {
    afficherMessage(`Erreur Zola : ${erreurMessage}`, true);
    arreterZola();
  });
  setTimeout(() => {
    btnLaunch.style.display = "none";
    document.getElementById("btn-stop").style.display = "block";
    btnLaunch.innerText = "▶️ Prévisualiser (Serveur)";
    afficherMessage("Serveur Zola lancé !", false);
  }, 1000);
}

function arreterZola() {
  zolaManager.arreterServeur();
  document.getElementById("btn-launch").style.display = "block";
  document.getElementById("btn-stop").style.display = "none";
  afficherMessage("Serveur arrêté.", false);
}

function genererSite() {
  if (!currentProjectDir)
    return afficherMessage("Chargez un projet d'abord", true);
  document.getElementById("custom-prompt").classList.add("visible");
  document.getElementById("prompt-input").focus();
}

function fermerPrompt() {
  document.getElementById("custom-prompt").classList.remove("visible");
  document.getElementById("prompt-input").value = "";
}

function confirmerGeneration() {
  const nomDossier = document.getElementById("prompt-input").value;
  if (!nomDossier || nomDossier.trim() === "")
    return afficherMessage("Le nom ne peut pas être vide", true);
  fermerPrompt();
  const nomNettoye = nomDossier.replace(/[^a-zA-Z0-9-_]/g, "_");

  // Chemin relatif correct pour remonter de 'renderer' vers la racine puis 'rendu_genere'
  const dossierExportsRacine = path.join(__dirname, "../../rendu_genere");

  const dossierSortie = path.join(dossierExportsRacine, nomNettoye);
  if (!fs.existsSync(dossierExportsRacine)) fs.mkdirSync(dossierExportsRacine);
  if (fs.existsSync(dossierSortie))
    return afficherMessage(`Le dossier "${nomNettoye}" existe déjà.`, true);
  afficherMessage("Génération en cours...", false);
  zolaManager.buildSite(currentProjectDir, dossierSortie, (error, stderr) => {
    if (error) afficherMessage(`Erreur génération : ${stderr}`, true);
    else afficherMessage(`Site généré dans : ${nomNettoye}`, false);
  });
}

function nouvelleSauvegarde() {
  gitManager.nouvelleSauvegarde(currentProjectDir, afficherMessage, () => {
    gitManager.chargerHistorique(currentProjectDir, (h) =>
      voirVersionRelais(h),
    );
  });
}

function pushSite() {
  gitManager.pushToRemote(currentProjectDir, afficherMessage);
}

function revenirAuPresent() {
  gitManager.revenirAuPresent(currentProjectDir, {
    afficherMessage: afficherMessage,
    reloadUI: () => {
      chargerListeFichiers();
      if (currentFilePath) ouvrirFichier(currentFilePath);
      gitManager.chargerHistorique(currentProjectDir, (h) =>
        voirVersionRelais(h),
      );
    },
  });
}

function pullSite() {
  gitManager.pullFromRemote(currentProjectDir, afficherMessage, () => {
    chargerListeFichiers();
    if (currentFilePath) ouvrirFichier(currentFilePath);
    gitManager.chargerHistorique(currentProjectDir, (h) =>
      voirVersionRelais(h),
    );
  });
}

function voirVersionRelais(hash) {
  gitManager.voirVersion(hash, currentProjectDir, {
    afficherMessage: afficherMessage,
    reloadUI: () => {
      chargerListeFichiers();
      if (currentFilePath) ouvrirFichier(currentFilePath);
    },
  });
}

// ============================================================
// 7. AJOUT DE PAGE (AMÉLIORÉ : PROJET + APP)
// ============================================================
const templateEngine = require("./templateEngine");

// Si renderer.js est dans /app/renderer/, alors ../templates pointe vers /app/templates/
const APP_TEMPLATES_DIR = path.join(__dirname, "../templates");

window.creerNouvellePage = () => {
  if (!currentProjectDir)
    return afficherMessage("Veuillez charger un projet.", true);

  // 1. Lister les dossiers du projet (content)
  const contentPath = path.join(currentProjectDir, "content");
  const getSubDirs = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

  const folders = ["(Racine)", ...getSubDirs(contentPath)];
  const folderSelect = document.getElementById("new-page-folder");
  folderSelect.innerHTML = folders
    .map((f) => `<option value="${f}">${f}</option>`)
    .join("");

  // 2. Lister les templates (Projet + Appli)
  const projectTemplatesDir = path.join(currentProjectDir, "templates");
  const projectTemplates = templateEngine.getTemplatesFromDir(
    projectTemplatesDir,
    "project",
  );
  const appTemplates = templateEngine.getTemplatesFromDir(
    APP_TEMPLATES_DIR,
    "app",
  );

  const selectTemplate = document.getElementById("new-page-template");
  selectTemplate.innerHTML = "";

  // Groupe 1 : Templates du Projet
  if (projectTemplates.length > 0) {
    const groupProject = document.createElement("optgroup");
    groupProject.label = "📂 Templates du Projet";
    projectTemplates.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.fullPath;
      opt.innerText = t.label;
      groupProject.appendChild(opt);
    });
    selectTemplate.appendChild(groupProject);
  }

  // Groupe 2 : Modèles de l'Application
  if (appTemplates.length > 0) {
    const groupApp = document.createElement("optgroup");
    groupApp.label = "✨ Modèles de l'Application";
    appTemplates.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.fullPath;
      opt.innerText = t.label;
      groupApp.appendChild(opt);
    });
    selectTemplate.appendChild(groupApp);
  }

  // 3. Préparer l'interface (Modale et Message d'indication)
  document.getElementById("modal-container").style.display = "flex";
  document.getElementById("new-page-error-msg").style.display = "none";

  // Création d'un élément pour afficher le conseil de template
  let hintSpan = document.getElementById("template-hint-msg");
  if (!hintSpan) {
    hintSpan = document.createElement("div");
    hintSpan.id = "template-hint-msg";
    hintSpan.style.fontSize = "0.85em";
    hintSpan.style.color = "#d35400"; // Orange visible
    hintSpan.style.marginBottom = "15px";
    hintSpan.style.fontStyle = "italic";
    // On l'insère juste après le selecteur de template
    selectTemplate.parentNode.insertBefore(
      hintSpan,
      selectTemplate.nextSibling,
    );
  }

  // 4. LOGIQUE DE DÉTECTION DU TEMPLATE DOMINANT
  folderSelect.onchange = () => {
    const selectedFolder = folderSelect.value;
    const section = selectedFolder === "(Racine)" ? "" : selectedFolder;
    const targetDir = path.join(contentPath, section);

    if (!fs.existsSync(targetDir)) return;

    // On lit les fichiers markdown du dossier
    const files = fs
      .readdirSync(targetDir)
      .filter((f) => f.endsWith(".md") && f !== "_index.md");

    if (files.length === 0) {
      hintSpan.innerText = "";
      return; // Dossier vide, on laisse l'utilisateur choisir librement
    }

    // On compte l'occurrence de chaque template
    const templateCounts = {};
    files.forEach((file) => {
      try {
        const filePath = path.join(targetDir, file);
        const { data } = fileManager.parseMarkdownFile(filePath); // Existant dans ton code
        if (data && data.template) {
          templateCounts[data.template] =
            (templateCounts[data.template] || 0) + 1;
        }
      } catch (e) {
        // Ignore les fichiers mal formés
      }
    });

    // On trouve le template le plus utilisé
    let mostUsedTemplate = null;
    let maxCount = 0;
    for (const [tpl, count] of Object.entries(templateCounts)) {
      if (count > maxCount) {
        mostUsedTemplate = tpl;
        maxCount = count;
      }
    }

    // Si on a trouvé une tendance, on met à jour l'interface
    if (mostUsedTemplate) {
      let foundInOptions = false;
      for (let i = 0; i < selectTemplate.options.length; i++) {
        // On vérifie si la valeur (qui est le chemin complet) se termine par le nom du template
        if (selectTemplate.options[i].value.endsWith(mostUsedTemplate)) {
          selectTemplate.selectedIndex = i;
          foundInOptions = true;
          break;
        }
      }

      if (foundInOptions) {
        hintSpan.innerHTML = `💡 <b>Conseil :</b> Le modèle "<b>${mostUsedTemplate}</b>" a été auto-sélectionné (utilisé par ${maxCount} page(s) dans ce dossier).`;
        updateTemplateFields();
      } else {
        hintSpan.innerText = "";
      }
    } else {
      hintSpan.innerText = "";
    }
  };

  // 5. Initialisation au lancement de la modale
  if (selectTemplate.options.length > 0) {
    selectTemplate.selectedIndex = 0;
    // Déclencher manuellement l'événement pour analyser le dossier par défaut (ex: "Racine")
    folderSelect.dispatchEvent(new Event("change"));
    updateTemplateFields();
  }
};

window.updateTemplateFields = () => {
  const templateFullPath = document.getElementById("new-page-template").value;
  const fileName = document.getElementById("new-page-filename").value.trim();
  const container = document.getElementById("template-fields-container");

  if (!templateFullPath) return;

  // Analyse basée sur le chemin complet (qu'il vienne de App ou Projet)
  const analysis = templateEngine.analyseTemplate(templateFullPath);
  const allVars = [...analysis.pageVars, ...analysis.extraVars];

  // Reset si changement de template
  if (container.dataset.currentTemplate !== templateFullPath) {
    container.innerHTML = "";
    container.dataset.currentTemplate = templateFullPath;
  }

  const today = new Date().toISOString().split("T")[0];

  allVars.forEach((varName) => {
    let input = container.querySelector(`[data-key="${varName}"]`);

    let suggestedValue = "";
    if (varName === "date") suggestedValue = today;
    else if (varName === "title") {
      suggestedValue = fileName
        ? fileName
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())
        : "Nouveau Titre";
    } else if (varName === "draft") suggestedValue = "false";

    if (!input) {
      const div = document.createElement("div");
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
      if (input.dataset.userEdited === "false") {
        input.value = suggestedValue;
      }
    }
  });
};

async function validerCreationPage() {
  const errorDiv = document.getElementById("new-page-error-msg");
  const fileNameInput = document.getElementById("new-page-filename");
  const fileName = fileNameInput.value.trim();
  const folderChoice = document.getElementById("new-page-folder").value;

  // On récupère le chemin complet depuis le select
  const templateFullPath = document.getElementById("new-page-template").value;
  const templateFileName = path.basename(templateFullPath); // ex: "blog.html"

  errorDiv.style.display = "none";

  if (!fileName) {
    errorDiv.innerText = "Le nom du fichier est requis.";
    errorDiv.style.display = "block";
    fileNameInput.style.borderColor = "#e74c3c";
    return;
  }

  const values = {};
  document.querySelectorAll(".template-input").forEach((input) => {
    values[input.dataset.key] = input.value;
  });

  try {
    // 1. Analyse (depuis le fichier source, peu importe où il est)
    const analysis = templateEngine.analyseTemplate(templateFullPath);

    // 2. Génération Markdown (avec juste le nom du fichier pour le frontmatter)
    const markdownContent = templateEngine.generateMarkdown(
      templateFileName,
      analysis,
      values,
    );

    // 3. Dossier cible
    const section = folderChoice === "(Racine)" ? "" : folderChoice;
    const targetDir = path.join(currentProjectDir, "content", section);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const finalPath = path.join(targetDir, `${fileName}.md`);

    if (fs.existsSync(finalPath)) {
      errorDiv.innerText = "Ce fichier existe déjà ici.";
      errorDiv.style.display = "block";
      return;
    }

    // 4. IMPORTATION AUTO DU TEMPLATE
    // On vérifie si le template existe dans le dossier templates du PROJET
    const projectTemplatesDir = path.join(currentProjectDir, "templates");
    const targetTemplatePath = path.join(projectTemplatesDir, templateFileName);

    // S'il n'existe pas dans le projet, on le copie depuis la source (l'appli)
    if (!fs.existsSync(targetTemplatePath)) {
      if (!fs.existsSync(projectTemplatesDir))
        fs.mkdirSync(projectTemplatesDir);

      fs.copyFileSync(templateFullPath, targetTemplatePath);
      console.log(`Template importé dans le projet : ${templateFileName}`);

      // Optionnel : Copier aussi le .yml associé s'il existe
      const ymlSource = templateFullPath.replace(".html", ".yml");
      if (fs.existsSync(ymlSource)) {
        fs.copyFileSync(ymlSource, targetTemplatePath.replace(".html", ".yml"));
      }
    }

    // 5. Écriture du fichier MD
    fs.writeFileSync(finalPath, markdownContent, "utf8");

    fermerModalePage();
    chargerListeFichiers();
    ouvrirFichier(finalPath);

    afficherMessage(
      `Page créée ! (Template ${templateFileName} utilisé)`,
      false,
    );
  } catch (e) {
    errorDiv.innerText = "Erreur : " + e.message;
    errorDiv.style.display = "block";
    console.error(e);
  }
}

// Pense aussi à réinitialiser le style de l'input quand on ferme la modale
function fermerModalePage() {
  document.getElementById("modal-container").style.display = "none";
  document.getElementById("new-page-filename").value = "";
  document.getElementById("new-page-filename").style.borderColor = "#ccc";
  document.getElementById("new-page-error-msg").style.display = "none";
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
    document.getElementById("ftp-host").value = config.host || "";
    document.getElementById("ftp-user").value = config.user || "";
    document.getElementById("ftp-port").value = config.port || 21;
    document.getElementById("ftp-root").value = config.remoteRoot || "/";
    // Par sécurité, on ne remplit pas le mot de passe automatiquement ou on le stocke
    // Pour cet exemple, on suppose que l'utilisateur le remet, ou on le stocke dans le json (risqué mais pratique)
    document.getElementById("ftp-pass").value = config.password || "";
  }

  document.getElementById("ftp-modal").style.display = "flex";
}

function closeFtpModal() {
  document.getElementById("ftp-modal").style.display = "none";
}

async function lancerDeploiement() {
  // 1. Récupérer les infos
  const config = {
    host: document.getElementById("ftp-host").value,
    user: document.getElementById("ftp-user").value,
    password: document.getElementById("ftp-pass").value,
    port: parseInt(document.getElementById("ftp-port").value) || 21,
    remoteRoot: document.getElementById("ftp-root").value,
  };

  if (!config.host || !config.user || !config.password) {
    afficherAlerte("Erreur", "Veuillez remplir tous les champs FTP.");
    return;
  }

  closeFtpModal();
  afficherMessage("⏳ Génération du site avant envoi...", false);

  // 2. Générer le site dans un dossier temporaire
  // On utilise un dossier '_temp_deploy' à la racine du projet
  const tempBuildDir = path.join(currentProjectDir, "_temp_deploy");

  // On sauvegarde la config pour la prochaine fois
  ftpManager.saveConfig(currentProjectDir, config);

  // On lance le build Zola
  zolaManager.buildSite(
    currentProjectDir,
    tempBuildDir,
    async (err, stderr) => {
      if (err) {
        afficherMessage(`❌ Erreur Build : ${stderr}`, true);
        return;
      }

      // 3. Si le build est OK, on lance l'upload FTP
      try {
        await ftpManager.deploy(config, tempBuildDir, afficherMessage);

        // Succès !
        afficherAlerte("Succès", "Site mis à ligne avec succès ! 🌍");

        // Nettoyage : on supprime le dossier temporaire (optionnel)
        try {
          fs.rmSync(tempBuildDir, { recursive: true, force: true });
        } catch (e) {}
      } catch (ftpError) {
        // L'erreur est déjà gérée dans le callback afficherMessage via ftpManager
        console.error(ftpError);
      }
    },
  );
}

// ============================================================
// 9. EXPOSITION GLOBALE (Mise à jour)
// ============================================================
window.openFtpModal = openFtpModal;
window.closeFtpModal = closeFtpModal;
window.lancerDeploiement = lancerDeploiement;

// ============================================================
// 10. GESTION GITHUB PAGES
// ============================================================

async function configurerGitHub() {
  if (!currentProjectDir) {
    afficherMessage("⚠️ Chargez un projet d'abord.", true);
    return;
  }

  // Vérification si déjà fait
  if (githubManager.isConfigured(currentProjectDir)) {
    const reponse = await demanderConfirmation(
      "Configuration existante",
      "GitHub Pages semble déjà configuré (fichier zola.yml détecté).\nVoulez-vous le réécrire ?",
    );
    if (!reponse) return;
  }

  // Création du fichier
  const success = githubManager.setupPages(currentProjectDir, afficherMessage);

  if (success) {
    // --- LE RAPPEL IMPORTANT EST ICI ---
    afficherAlerte(
      "Configuration terminée !",
      `✅ Fichier de configuration créé avec succès !\n\n⚠️ ÉTAPE CRUCIALE SUR GITHUB.COM :\nPour que le site fonctionne, vous devez activer "GitHub Actions" sur le site web :\n\n1. Allez sur votre dépôt GitHub > onglet 'Settings'.\n2. Cliquez sur 'Pages' (menu de gauche).\n3. Dans la section 'Build and deployment', changez la Source.\n   👉 Sélectionnez : "GitHub Actions".\n\nUne fois cela fait :\n1. Revenez ici et cliquez sur '💾 Sauvegarder l'état'.\n2. Cliquez sur '☁️ Publier sur Internet'.`,
    );

    // On lance la sauvegarde automatiquement pour gagner du temps
    nouvelleSauvegarde();
  }
}

// ============================================================
// 11. GESTION SUPPRESSION
// ============================================================

function demanderSuppression() {
  if (!currentFilePath) {
    afficherMessage("Aucun fichier ouvert.", true); //
    return;
  }

  // Affiche le nom du fichier dans la modale
  const nomFichier = path.basename(currentFilePath);
  document.getElementById("delete-filename-display").innerText = nomFichier;

  // Ouvre la modale
  document.getElementById("modal-delete-confirm").style.display = "flex";
}

function fermerModalSuppression() {
  document.getElementById("modal-delete-confirm").style.display = "none";
}

function confirmerSuppression() {
  if (!currentFilePath) return;

  try {
    // Suppression physique du fichier
    fs.unlinkSync(currentFilePath);

    // Nettoyage de l'interface
    fermerModalSuppression();
    afficherMessage("Fichier supprimé avec succès.", false); //

    // Reset des variables globales
    currentFilePath = null;
    currentAst = null; //

    // On vide l'éditeur
    document.getElementById("form-container").innerHTML =
      '<p style="color: #666; font-style: italic;">Sélectionnez un fichier .md pour commencer.</p>';

    // Mise à jour de la liste des fichiers à gauche
    chargerListeFichiers(); //
  } catch (e) {
    console.error(e);
    fermerModalSuppression();
    afficherMessage("Erreur lors de la suppression : " + e.message, true); //
  }
}

// ============================================================
// 12. EXPORTS GLOBAUX
// ============================================================

window.afficherMessage = afficherMessage;
window.afficherAlerte = afficherAlerte;
window.demanderConfirmation = demanderConfirmation;
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
window.demanderSuppression = demanderSuppression;
window.fermerModalSuppression = fermerModalSuppression;
window.confirmerSuppression = confirmerSuppression;
window.getCurrentProjectDir = () => currentProjectDir;
window.chargerListeFichiers = chargerListeFichiers;
window.ouvrirFichier = ouvrirFichier;
