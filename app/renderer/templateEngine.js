const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/* ======================================================
1️ RÉCUPÉRATION DES TEMPLATES (MODIFIÉ)
====================================================== */

// Nouvelle version qui scanne un dossier spécifique
function getTemplatesFromDir(templatesDir, sourceName) {
    if (!fs.existsSync(templatesDir)) return [];

    const files = fs.readdirSync(templatesDir)
        .filter(f => f.endsWith(".html"));

    return files.map(file => {
        const fullPath = path.join(templatesDir, file);

        // On tente de générer/lire la config YAML
        try { ensureYamlForTemplate(fullPath); } catch(e) {}
        const config = loadTemplateConfig(fullPath);

        return {
            filename: file,              // ex: "blog.html"
            fullPath: fullPath,          // ex: "C:/.../blog.html"
            label: config?.label || file.replace(".html", ""),
            source: sourceName           // 'project' ou 'app'
        };
    });
}

// Gardé pour compatibilité si besoin, mais on utilisera surtout celle du dessus
function getTemplates(templatesDir) {
    return getTemplatesFromDir(templatesDir, 'project').map(t => ({
        id: t.filename,
        label: t.label
    }));
}

/* ======================================================
2️  ANALYSE SIMPLE
====================================================== */

function analyseTemplate(filePath) {
    if (!fs.existsSync(filePath)) return { pageVars: [], extraVars: [] };

    const content = fs.readFileSync(filePath, "utf8");

    const pageVars = new Set();
    const extraVars = new Set();

    const pageMatches = content.match(/page\.(\w+)/g);
    if (pageMatches) {
        pageMatches.forEach(m => {
            const key = m.split(".")[1];
            if (!["content", "permalink", "extra", "html"].includes(key)) {
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
3️  GÉNÉRATION MARKDOWN
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

    // Zola a besoin du nom de fichier, pas du chemin complet
    md += `template = "${path.basename(templateName)}"\n`;

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
4️  CHARGEMENT CONFIG YAML
====================================================== */

function loadTemplateConfig(templatePath) {
    const ymlPath = templatePath.replace(".html", ".yml");
    if (!fs.existsSync(ymlPath)) return null;
    try {
        const file = fs.readFileSync(ymlPath, "utf8");
        return yaml.load(file);
    } catch (e) { return null; }
}

/* ======================================================
5️  EXTRACTION VARIABLES TWIG
====================================================== */

function extractVariablesFromTemplate(htmlContent) {
    const regex = /{{\s*([^}]+)\s*}}/g;
    const variables = new Set();
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
        let raw = match[1].trim();
        raw = raw.split("|")[0].trim();
        if (raw.includes("(")) continue;
        if (raw.startsWith("page.")) variables.add(raw.replace("page.", ""));
        if (raw.startsWith("taxonomies.")) variables.add(raw);
    }
    return Array.from(variables);
}

/* ======================================================
6️  DÉTECTION TYPE AUTO
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
7️ GÉNÉRATION YAML
====================================================== */

function generateYaml(templateId, variables) {
    if (variables.length === 0) {
        return `id: ${templateId}\nlabel: ${templateId}\ndescription: >\n  Template sans variables détectées.\nfields: []\n`;
    }
    const fields = variables.map(variable => {
        const type = detectFieldType(variable);
        const label = variable.replace("extra.", "").replace("taxonomies.", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        return `  - name: ${variable}\n    label: ${label}\n    type: ${type}\n    required: false`;
    }).join("\n\n");
    return `id: ${templateId}\nlabel: ${templateId}\ndescription: >\n  Auto-généré.\nfields:\n\n${fields}\n`;
}

/* ======================================================
8️ AUTO-GÉNÉRATION YAML SI ABSENT
====================================================== */

function ensureYamlForTemplate(templatePath) {
    const ymlPath = templatePath.replace(".html", ".yml");
    if (fs.existsSync(ymlPath)) return;
    try {
        const html = fs.readFileSync(templatePath, "utf8");
        const variables = extractVariablesFromTemplate(html);
        const templateId = path.basename(templatePath, ".html");
        const yamlContent = generateYaml(templateId, variables);
        fs.writeFileSync(ymlPath, yamlContent, "utf8");
    } catch (e) { console.error("Err YAML gen:", e); }
}

module.exports = {
    getTemplates,
    getTemplatesFromDir, // Exporté !
    analyseTemplate,
    generateMarkdown,
    loadTemplateConfig,
    ensureYamlForTemplate
};