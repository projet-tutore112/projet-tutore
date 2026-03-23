// renderer/uiActions.js
const fs = require('fs');
const path = require('path');
const templateEngine = require('./templateEngine');

module.exports = function creerNouvellePageUI(projectDir, refreshFiles, openFile) {

    if (!projectDir) {
        if (window.afficherMessage) window.afficherMessage("⚠️ Charge un projet avant de créer une page", true);
        return;
    }

    if (document.getElementById('modal-new-page')) return;

    const templatesDir = path.join(__dirname, "../templates");
    const templates = templateEngine.getTemplates(templatesDir);

    let templateOptions = templates.map(t =>
        `<option value="${t.id}">${t.label}</option>`
    ).join("");

    if (!templateOptions) {
        templateOptions = `<option disabled>Aucun template trouvé</option>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'modal-new-page';
    overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.5);
        display:flex;
        justify-content:center;
        align-items:center;
        z-index:2000;
    `;

    overlay.innerHTML = `
        <div style="
            background:white;
            padding:20px;
            border-radius:8px;
            width:420px;
            max-height:90vh;
            overflow:auto;
            box-shadow:0 10px 30px rgba(0,0,0,0.3);
        ">
            <h3>➕ Nouvelle page Zola</h3>
            <div id="new-page-error"></div>

            <label><strong>Nom du fichier</strong></label>
            <input id="new-page-name" type="text"
                placeholder="ex: a-propos"
                style="width:100%; padding:8px; margin:8px 0;">

            <label><strong>Template</strong></label>
            <select id="new-page-template"
                style="width:100%; padding:8px; margin-bottom:15px;">
                ${templateOptions}
            </select>

            <div id="dynamic-fields"></div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
                <button id="cancel-new-page">Annuler</button>
                <button id="confirm-new-page"
                    style="background:#27ae60; color:white; border:none; padding:6px 12px;">
                    Créer
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('new-page-name').focus();

    const templateSelect = document.getElementById('new-page-template');
    const dynamicFields = document.getElementById('dynamic-fields');

    // ============================
    // Génération dynamique formulaire
    // ============================

    function generateForm(templateFile) {

        dynamicFields.innerHTML = "";

        const templatePath = path.join(templatesDir, templateFile);
        const config = templateEngine.loadTemplateConfig(templatePath);

        if (!config) {
            dynamicFields.innerHTML = "<p style='color:#888'>Aucun fichier YML associé</p>";
            return;
        }

        function createInput(key, field, prefix) {

            const id = `${prefix}-${key}`;

            let inputHTML = "";

            switch (field.type) {
                case "textarea":
                    inputHTML = `<textarea id="${id}" style="width:100%; padding:6px;"></textarea>`;
                    break;

                case "number":
                    inputHTML = `<input type="number" id="${id}" style="width:100%; padding:6px;">`;
                    break;

                case "date":
                    inputHTML = `<input type="date" id="${id}" style="width:100%; padding:6px;">`;
                    break;

                case "boolean":
                    inputHTML = `<input type="checkbox" id="${id}">`;
                    break;

                default:
                    inputHTML = `<input type="text" id="${id}" style="width:100%; padding:6px;">`;
            }

            return `
                <div style="margin-bottom:10px;">
                    <label><strong>${field.label}</strong></label>
                    ${inputHTML}
                </div>
            `;
        }

        if (config.page) {
            dynamicFields.innerHTML += "<h4>Champs principaux</h4>";
            for (const key in config.page) {
                dynamicFields.innerHTML += createInput(key, config.page[key], "page");
            }
        }

        if (config.extra) {
            dynamicFields.innerHTML += "<h4>Champs supplémentaires</h4>";
            for (const key in config.extra) {
                dynamicFields.innerHTML += createInput(key, config.extra[key], "extra");
            }
        }
    }

    templateSelect.onchange = () => {
        generateForm(templateSelect.value);
    };

    generateForm(templateSelect.value);

    // ============================
    // ANNULATION
    // ============================

    document.getElementById('cancel-new-page').onclick = () => {
        overlay.remove();
    };

    // ============================
    // CRÉATION
    // ============================

    document.getElementById('confirm-new-page').onclick = () => {

        const nom = document.getElementById('new-page-name').value.trim();
        const templateFile = templateSelect.value;

        if (!nom) {
            afficherErreur("Nom obligatoire");
            return;
        }

        const safeName = nom.replace(/[^a-zA-Z0-9-_]/g, '-');
        const templatePath = path.join(templatesDir, templateFile);
        const config = templateEngine.loadTemplateConfig(templatePath);

        const values = {};

        if (config) {

            if (config.page) {
                for (const key in config.page) {
                    const field = config.page[key];
                    const input = document.getElementById(`page-${key}`);
                    const value = field.type === "boolean"
                        ? input.checked
                        : input.value;

                    if (field.required && !value) {
                        afficherErreur(`${field.label} est obligatoire`);
                        return;
                    }

                    values[key] = value;
                }
            }

            if (config.extra) {
                for (const key in config.extra) {
                    const field = config.extra[key];
                    const input = document.getElementById(`extra-${key}`);
                    const value = field.type === "boolean"
                        ? input.checked
                        : input.value;

                    values[key] = value;
                }
            }
        }

        try {

            const analysis = templateEngine.analyseTemplate(templatePath);

            const markdown = templateEngine.generateMarkdown(
                templateFile,
                analysis,
                values
            );

            const contentDir = path.join(projectDir, 'content');
            if (!fs.existsSync(contentDir)) {
                fs.mkdirSync(contentDir, { recursive: true });
            }

            const filePath = path.join(contentDir, `${safeName}.md`);

            if (fs.existsSync(filePath)) {
                afficherErreur("Ce fichier existe déjà");
                return;
            }

            fs.writeFileSync(filePath, markdown, 'utf8');

            overlay.remove();
            refreshFiles();
            openFile(filePath);

        } catch (error) {
            console.error(error);
            afficherErreur("Erreur : " + error.message);
        }
    };

    function afficherErreur(message) {
        const errorDiv = document.getElementById('new-page-error');
        errorDiv.style.color = '#e74c3c';
        errorDiv.style.fontWeight = 'bold';
        errorDiv.style.marginBottom = '10px';
        errorDiv.innerText = message;
    }
};