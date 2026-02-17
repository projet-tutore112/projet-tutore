const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/* ======================================================
   1️⃣  RÉCUPÉRATION DES TEMPLATES
====================================================== */

function getTemplates(templatesDir) {
    if (!fs.existsSync(templatesDir)) return [];

    const files = fs.readdirSync(templatesDir)
        .filter(f => f.endsWith(".html"));

    return files.map(file => {

        const fullPath = path.join(templatesDir, file);

        // Génère le YAML automatiquement si absent
        ensureYamlForTemplate(fullPath);

        const config = loadTemplateConfig(fullPath);

        return {
            id: file,
            label: config?.label || file.replace(".html", "")
        };
    });
}

/* ======================================================
   2️⃣  ANALYSE SIMPLE (ancienne logique conservée)
====================================================== */

function analyseTemplate(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    const pageVars = new Set();
    const extraVars = new Set();

    const pageMatches = content.match(/page\.(\w+)/g);
    if (pageMatches) {
        pageMatches.forEach(m => {
            const key = m.split(".")[1];
            if (!["content", "permalink", "extra"].includes(key)) {
                pageVars.add(key);
            }
        });
    }

    const extraMatches = content.match(/page\.extra\.(\w+)/g);
    if (extraMatches) {
        extraMatches.forEach(m => {
            const key = m.split(".")[2];
            extraVars.add(key);
        });
    }

    return {
        pageVars: Array.from(pageVars),
        extraVars: Array.from(extraVars)
    };
}

/* ======================================================
   3️⃣  GÉNÉRATION MARKDOWN
====================================================== */

function generateMarkdown(templateName, analysis, values) {
    let md = "+++\n";

    analysis.pageVars.forEach(key => {
        const val = values[key] || "";
        if (key === "date") {
            md += `date = ${val}\n`;
        } else {
            md += `${key} = "${val}"\n`;
        }
    });

    md += `template = "${templateName}"\n`;

    if (analysis.extraVars.length > 0) {
        md += "\n[extra]\n";
        analysis.extraVars.forEach(key => {
            md += `${key} = "${values[key] || ""}"\n`;
        });
    }

    md += "+++\n\n";
    md += `# ${values.title || "Titre"}\n\n`;
    md += "Contenu ici...\n";

    return md;
}

/* ======================================================
   4️⃣  CHARGEMENT CONFIG YAML
====================================================== */

function loadTemplateConfig(templatePath) {
    const ymlPath = templatePath.replace(".html", ".yml");

    if (!fs.existsSync(ymlPath)) return null;

    const file = fs.readFileSync(ymlPath, "utf8");
    return yaml.load(file);
}

/* ======================================================
   5️⃣  EXTRACTION VARIABLES TWIG (AMÉLIORÉE)
====================================================== */

function extractVariablesFromTemplate(htmlContent) {

    const regex = /{{\s*([^}]+)\s*}}/g;
    const variables = new Set();

    let match;
    while ((match = regex.exec(htmlContent)) !== null) {

        let raw = match[1].trim();

        // Supprime filtres twig (| safe etc.)
        raw = raw.split("|")[0].trim();

        // Ignore fonctions type get_url()
        if (raw.includes("(")) continue;

        if (raw.startsWith("page.")) {
            variables.add(raw.replace("page.", ""));
        }

        if (raw.startsWith("taxonomies.")) {
            variables.add(raw);
        }
    }

    return Array.from(variables);
}

/* ======================================================
   6️⃣  DÉTECTION TYPE AUTO
====================================================== */

function detectFieldType(name) {

    const v = name.toLowerCase();

    if (v.includes("date")) return "date";
    if (v.includes("description") || v.includes("summary")) return "textarea";
    if (v.includes("content")) return "textarea";
    if (v.includes("tags") || v.includes("categories")) return "list";
    if (v.includes("image") || v.includes("logo")) return "text";
    if (v.includes("video")) return "text";
    if (v.includes("price")) return "text";
    if (v.includes("email")) return "text";
    if (v.includes("url") || v.includes("link")) return "text";

    return "text";
}

/* ======================================================
   7️⃣  GÉNÉRATION YAML
====================================================== */

function generateYaml(templateId, variables) {

    if (variables.length === 0) {
        return `id: ${templateId}
label: ${templateId}

description: >
  Template sans variables détectées automatiquement.

fields: []
`;
    }

    const fields = variables.map(variable => {

        const type = detectFieldType(variable);

        const label = variable
            .replace("extra.", "")
            .replace("taxonomies.", "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, l => l.toUpperCase());

        return `  - name: ${variable}
    label: ${label}
    type: ${type}
    required: false`;
    }).join("\n\n");

    return `id: ${templateId}
label: ${templateId}

description: >
  Fichier généré automatiquement depuis le template HTML.

fields:

${fields}
`;
}

/* ======================================================
   8️⃣  AUTO-GÉNÉRATION YAML SI ABSENT
====================================================== */

function ensureYamlForTemplate(templatePath) {

    const ymlPath = templatePath.replace(".html", ".yml");

    if (fs.existsSync(ymlPath)) return;

    const html = fs.readFileSync(templatePath, "utf8");
    const variables = extractVariablesFromTemplate(html);

    const templateId = path.basename(templatePath, ".html");
    const yamlContent = generateYaml(templateId, variables);

    fs.writeFileSync(ymlPath, yamlContent, "utf8");

    console.log("✔ YAML généré automatiquement :", ymlPath);
}

/* ======================================================
   EXPORT
====================================================== */

module.exports = {
    getTemplates,
    analyseTemplate,
    generateMarkdown,
    loadTemplateConfig,
    ensureYamlForTemplate
};
