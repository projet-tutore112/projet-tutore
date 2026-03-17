// renderer/gitManager.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Fonction interne (privée) pour exécuter les commandes
async function execGit(commande, projectDir) {
    if (!projectDir) return;
    return new Promise((resolve, reject) => {
        exec(commande, { cwd: projectDir }, (error, stdout, stderr) => {
            if (error) {
                console.warn("Git Warning:", stderr);
            }
            resolve(stdout ? stdout.trim() : '');
        });
    });
}

module.exports = {
    // 1. AFFICHER L'HISTORIQUE
    chargerHistorique: async function(projectDir, voirVersionCallback) {
        const divHistory = document.getElementById('git-history');
        if (!divHistory) return;
        
        divHistory.innerHTML = "⏳ Chargement...";

        const isGit = fs.existsSync(path.join(projectDir, '.git'));
        if (!isGit) {
            divHistory.innerHTML = "<div style='padding:5px; color: #888;'>Ce dossier n'est pas un dépôt Git.</div>";
            return;
        }

        try {
            const logs = await execGit('git log --pretty=format:"%h|%ad|%s" --date=short -n 10', projectDir);
            
            divHistory.innerHTML = "";
            
            if (!logs) {
                divHistory.innerHTML = "Aucun historique.";
                return;
            }

            const lignes = logs.split('\n');
            lignes.forEach(ligne => {
                const [hash, date, msg] = ligne.split('|');
                const item = document.createElement('div');
                item.style.borderBottom = "1px solid #eee";
                item.style.padding = "5px";
                item.style.cursor = "pointer";
                item.innerHTML = `
                    <strong style="color:#007bff;">${hash}</strong> <span style="color:#666; font-size:0.9em;">(${date})</span><br>
                    ${msg}
                `;
                item.onclick = () => voirVersionCallback(hash);
                item.onmouseover = () => item.style.background = "#f0f8ff";
                item.onmouseout = () => item.style.background = "transparent";
                divHistory.appendChild(item);
            });

        } catch (e) {
            divHistory.innerText = "Erreur Git: " + e.message;
        }
    },

    // 2. CRÉER UN COMMIT (Sauvegarde locale)
    nouvelleSauvegarde: async function(projectDir, afficherMessageCallback, refreshCallback) {
        if (!projectDir) {
            if (afficherMessageCallback) afficherMessageCallback("Aucun projet chargé.", true);
            return;
        }

        // On ouvre la modale
        document.getElementById('custom-prompt').classList.add('visible');
        const promptInput = document.getElementById('prompt-input');
        promptInput.value = "Mise à jour du site";
        promptInput.focus();

        const btnValider = document.querySelector('#custom-prompt button[onclick="confirmerGeneration()"]');
        const btnAnnuler = document.querySelector('#custom-prompt button[onclick="fermerPrompt()"]');
        
        const oldOnclick = btnValider.onclick; 

        const cleanup = () => {
            btnValider.onclick = oldOnclick;
            btnAnnuler.removeEventListener('click', cleanup);
        };

        btnAnnuler.addEventListener('click', cleanup);

        btnValider.onclick = async () => {
            const message = promptInput.value;
            if (!message) {
                afficherMessageCallback("Message obligatoire !", true);
                return;
            }
            
            document.getElementById('custom-prompt').classList.remove('visible');
            promptInput.value = '';
            cleanup();

            afficherMessageCallback("⏳ Sauvegarde en cours...", false);

            try {
                await execGit('git add .', projectDir);
                await execGit(`git commit -m "${message}"`, projectDir);
                afficherMessageCallback("✅ Version sauvegardée !", false);
                refreshCallback(); 
            } catch (e) {
                afficherMessageCallback("Erreur sauvegarde : " + e.message, true);
            }
        };
    },

    // 3. CHANGER DE VERSION (Checkout)
    voirVersion: async function(hash, projectDir, callbacks) {
        const confirm = window.demanderConfirmation 
            ? await window.demanderConfirmation("Visualiser une version", `Voulez-vous visualiser la version ${hash} ?\n\n⚠️ L'application passera en mode "Lecture Seule".`)
            : true; 
            
        if (confirm) {
            try {
                await execGit(`git checkout ${hash}`, projectDir);
                callbacks.afficherMessage(`👀 Visualisation : ${hash}`, false);
                const btnRetour = document.getElementById('btn-retour-present');
                if (btnRetour) btnRetour.style.display = 'block';
                callbacks.reloadUI();
            } catch (e) {
                callbacks.afficherMessage("Impossible de changer de version : " + e, true);
            }
        }
    },

    // 4. RETOUR AU PRÉSENT (Checkout main)
    revenirAuPresent: async function(projectDir, callbacks) {
        try {
            await execGit('git checkout main', projectDir); 
            callbacks.afficherMessage("✅ Retour au présent", false);
            const btnRetour = document.getElementById('btn-retour-present');
            if (btnRetour) btnRetour.style.display = 'none';
            callbacks.reloadUI();
        } catch (e) {
            try {
                await execGit('git checkout master', projectDir);
                callbacks.afficherMessage("✅ Retour au présent", false);
                const btnRetour = document.getElementById('btn-retour-present');
                if (btnRetour) btnRetour.style.display = 'none';
                callbacks.reloadUI();
            } catch (err) {
                callbacks.afficherMessage("Erreur retour : " + err, true);
            }
        }
    },

    // 5. PUBLIER SUR INTERNET (Git Push)
    pushToRemote: async function(projectDir, afficherMessageCallback) {
        if (!projectDir) return;

        const confirm = window.demanderConfirmation 
            ? await window.demanderConfirmation("Publication", "Voulez-vous vraiment envoyer le site en ligne ?\n\nCela mettra à jour le site Web public.")
            : true;
            
        if (!confirm) return;

        afficherMessageCallback("☁️ Envoi vers GitHub en cours...", false);

        try {
            // Tente d'envoyer sur 'main'
            await execGit('git push -u origin main', projectDir);
            
            afficherMessageCallback("✅ Site publié avec succès ! Félicitations !", false);
            if (window.afficherAlerte) window.afficherAlerte("Succès", "Félicitations ! Votre site est en cours de mise à jour sur GitHub.");

        } catch (e) {
            console.error(e);
            // Gestion erreur mot de passe
            if (e.message.includes("Authentication failed") || e.message.includes("could not read Username")) {
                if (window.afficherAlerte) {
                    window.afficherAlerte("Erreur d'authentification 🔒", "Votre ordinateur ne connaît pas vos identifiants GitHub.\nPour la première fois, faites un 'git push' manuellement dans un terminal.");
                } else {
                    afficherMessageCallback("Erreur d'authentification GitHub.", true);
                }
            } else {
                afficherMessageCallback("Erreur lors de l'envoi : " + e.message, true);
            }
        }
    },



// 6. RÉCUPÉRER DEPUIS INTERNET (Git Pull)
    pullFromRemote: async function(projectDir, afficherMessageCallback, reloadUICallback) {
        if (!projectDir) return;

        afficherMessageCallback("Récupération depuis GitHub en cours", false);

        try {
            // Tente de récupérer depuis 'main'
            await execGit('git pull origin main', projectDir);
            
            afficherMessageCallback("✅ Site synchronisé avec succès !", false);
            if (window.afficherAlerte) window.afficherAlerte("Succès", "Votre projet a bien été mis à jour avec la version en ligne.");
            
            // On recharge l'interface pour afficher les éventuels nouveaux fichiers
            if (reloadUICallback) reloadUICallback();

        } catch (e) {
            console.error(e);
            // Gestion des conflits si on a modifié le même fichier en ligne et localement
            if (e.message.includes("conflict") || e.message.includes("Resolve all conflicts")) {
                if (window.afficherAlerte) {
                    window.afficherAlerte("Conflit de modification ⚠️", "Vous avez modifié des fichiers localement ET en ligne en même temps. Impossible de synchroniser automatiquement.");
                }
            } else {
                if (window.afficherAlerte) {
                    window.afficherAlerte("Erreur de synchronisation", "Erreur : " + e.message);
                }
            }
            afficherMessageCallback("❌ Erreur lors du Pull.", true);
        }
    },

// 7. VÉRIFIER LES MISES À JOUR (Fetch + Status)
    verifierMiseAJour: async function(projectDir, promptPullCallback) {
        if (!projectDir) return;
        
        const isGit = fs.existsSync(path.join(projectDir, '.git'));
        if (!isGit) return; // Si ce n'est pas un projet Git, on ne fait rien

        try {
            // 1. On récupère les infos du serveur (sans modifier les fichiers locaux)
            await execGit('git fetch', projectDir);
            
            // 2. On lit le statut actuel
            const status = await execGit('git status -uno', projectDir);
            
            // 3. On cherche les mots-clés indiquant qu'on est en retard par rapport au serveur
            if (status.includes('Your branch is behind') || status.includes('Votre branche est en retard') || status.includes('have diverged')) {
                promptPullCallback();
            }
        } catch (e) {
            // S'il n'y a pas internet ou pas de dépôt distant configuré, on ignore silencieusement
            console.warn("Impossible de vérifier les mises à jour en ligne :", e.message);
        }
    }
};

