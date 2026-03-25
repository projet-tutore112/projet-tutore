const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const toml = require("@iarna/toml");

/* ======================================================
1️ RÉCUPÉRATION DES TEMPLATES
====================================================== */

function getTemplatesFromDir(templatesDir, sourceName) {
    if (!fs.existsSync(templatesDir)) return [];

    const files = fs.readdirSync(templatesDir)
        .filter(f => f.endsWith(".html"));

    return files.map(file => {
        const fullPath = path.join(templatesDir, file);

        try { ensureYamlForTemplate(fullPath); } catch(e) {}

        const config = loadTemplateConfig(fullPath);

        return {
            filename: file,
            fullPath: fullPath,
            label: config?.label || file.replace(".html", ""),
            source: sourceName
        };
    });
}

function getTemplates(templatesDir) {
    return getTemplatesFromDir(templatesDir, 'project').map(t => ({
        id: t.filename,
        label: t.label
    }));
}

/* ======================================================
2️ ANALYSE TEMPLATE (AMÉLIORÉE)
====================================================== */

function analyseTemplate(filePath) {
    if (!fs.existsSync(filePath)) return { pageVars: [], extraVars: [] };

    const content = fs.readFileSync(filePath, "utf8");

    const pageVars = new Set();
    const extraVars = new Set();

    // ===== page.xxx =====
    const pageMatches = content.match(/page\.(\w+)/g);
    if (pageMatches) {
        pageMatches.forEach(m => {
            pageVars.add(m.split(".")[1]);
        });
    }

    // ===== p.xxx (dans boucles) =====
    const loopMatches = content.match(/p\.(\w+)/g);
    if (loopMatches) {
        loopMatches.forEach(m => {
            const key = m.split(".")[1];
            if (key !== "extra") {
                pageVars.add(key);
            }
        });
    }

    // ===== p.extra.xxx =====
    const extraMatches = content.match(/p\.extra\.(\w+)/g);
    if (extraMatches) {
        extraMatches.forEach(m => {
            extraVars.add(m.split(".")[2]);
        });
    }

    // ===== BONUS : page.extra.xxx =====
    const pageExtraMatches = content.match(/page\.extra\.(\w+)/g);
    if (pageExtraMatches) {
        pageExtraMatches.forEach(m => {
            extraVars.add(m.split(".")[2]);
        });
    }

    return {
        pageVars: Array.from(pageVars),
        extraVars: Array.from(extraVars)
    };
}

/* ======================================================
3️ EXTRACTION MARKDOWN (.md)
====================================================== */

function extractMarkdownData(mdPath) {
    if (!fs.existsSync(mdPath)) {
        return { page: {}, extra: {} };
    }

    const content = fs.readFileSync(mdPath, "utf8");

    const match = content.match(/\+\+\+([\s\S]*?)\+\+\+/);
    if (!match) return { page: {}, extra: {} };

    try {
        const data = toml.parse(match[1]);

        return {
            page: data,
            extra: data.extra || {}
        };
    } catch (e) {
        console.error("Erreur parsing TOML:", e);
        return { page: {}, extra: {} };
    }
}

/* ======================================================
4️ CHARGEMENT YAML
====================================================== */

function loadTemplateConfig(templatePath) {
    const ymlPath = templatePath.replace(".html", ".yml");
    if (!fs.existsSync(ymlPath)) return null;

    try {
        const file = fs.readFileSync(ymlPath, "utf8");
        return yaml.load(file);
    } catch (e) {
        return null;
    }
}

/* ======================================================
5️ DÉTECTION TYPE AUTO
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
6️ EXTRACTION VARIABLES BRUTES
====================================================== */

function extractVariablesFromTemplate(htmlContent) {
    const regex = /{{\s*([^}]+)\s*}}/g;
    const variables = new Set();

    let match;

    while ((match = regex.exec(htmlContent)) !== null) {
        let raw = match[1].trim();
        raw = raw.split("|")[0].trim();

        if (raw.includes("(")) continue;

        if (raw.startsWith("page.")) {
            variables.add(raw.replace("page.", ""));
        }
    }

    return Array.from(variables);
}

/* ======================================================
7️ GÉNÉRATION YAML
====================================================== */

function generateYaml(templateId, variables) {

    if (variables.length === 0) {
        return `id: ${templateId}
label: ${templateId}
description: >
  Template sans variables détectées.
fields: []
`;
    }

    const fields = variables.map(variable => {

        const clean = variable.replace("extra.", "");

        const label = clean
            .replace(/_/g, " ")
            .replace(/\b\w/g, l => l.toUpperCase());

        const type = detectFieldType(clean);

        return `  - name: ${clean}
    label: ${label}
    type: ${type}
    required: false`;

    }).join("\n\n");

    return `id: ${templateId}
label: ${templateId}
description: >
  Auto-généré depuis le template.
fields:

${fields}
`;
}

/* ======================================================
8️ AUTO-GÉNÉRATION YAML
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

    } catch (e) {
        console.error("Erreur génération YAML:", e);
    }
}

/* ======================================================
9️ FONCTION PRINCIPALE 
====================================================== */

function getPageVariables(mdPath, templatePath) {

    const analysis = analyseTemplate(templatePath);
    const yamlConfig = loadTemplateConfig(templatePath);
    const mdData = extractMarkdownData(mdPath);

    const result = {
        page: [],
        extra: [],
        unknown: []
    };

    // YAML PRIORITAIRE
    if (yamlConfig && yamlConfig.fields) {

        yamlConfig.fields.forEach(field => {
            const value = mdData.extra[field.name];

            result.extra.push({
                name: field.name,
                label: field.label || field.name,
                type: field.type || "text",
                value: value ?? null,
                used: value !== undefined
            });
        });

    } else {

        analysis.extraVars.forEach(name => {
            const value = mdData.extra[name];

            result.extra.push({
                name,
                type: detectFieldType(name),
                value: value ?? null,
                used: value !== undefined
            });
        });
    }

    // PAGE VARS
    analysis.pageVars.forEach(name => {
        const value = mdData.page[name];

        result.page.push({
            name,
            value: value ?? null,
            used: value !== undefined
        });
    });

    // VARIABLES INCONNUES
    Object.keys(mdData.extra).forEach(key => {
        const exists = result.extra.find(f => f.name === key);
        if (!exists) {
            result.unknown.push({
                name: key,
                value: mdData.extra[key]
            });
        }
    });

    return result;
}

/* ======================================================
10️ GÉNÉRATION MARKDOWN
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
EXPORTS
====================================================== */

module.exports = {
    getTemplates,
    getTemplatesFromDir,
    analyseTemplate,
    extractMarkdownData,
    loadTemplateConfig,
    ensureYamlForTemplate,
    getPageVariables,
    generateMarkdown
};