// renderer/netlifyManager.js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

module.exports = {

    deploy: async function(config, localDir, logCallback) {
        try {
            logCallback("📦 Compression des fichiers du site...", false);
            
            // 1. Création de l'archive ZIP
            const zip = new AdmZip();
            zip.addLocalFolder(localDir);
            const zipBuffer = zip.toBuffer();

            logCallback("🚀 Envoi vers les serveurs de Netlify...", false);
            
            // 2. Préparation de la requête API
            const siteId = config.siteId.trim();
            const token = config.token.trim();
            
            const url = `https://api.netlify.com/api/v1/sites/${siteId}/deploys`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/zip',
                    'Authorization': `Bearer ${token}`
                },
                body: zipBuffer
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Code ${response.status} : Vérifiez le nom du site et votre Token.`);
            }

            logCallback("✅ Déploiement Netlify réussi !", false);
            return true;

        } catch(err) {
            console.error(err);
            logCallback(`❌ Erreur Netlify : ${err.message}`, true);
            throw err;
        }
    },

    saveConfig: function(projectDir, configData) {
        const configPath = path.join(projectDir, 'netlify.json');
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    },

    loadConfig: function(projectDir) {
        const configPath = path.join(projectDir, 'netlify.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        return null;
    }
};