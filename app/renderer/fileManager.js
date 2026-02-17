const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const toml = require('@iarna/toml');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith('.md')) {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

function parseMarkdownFile(chemin) {
    const contenuBrut = fs.readFileSync(chemin, 'utf8');
    let format = 'yaml';
    let parsed;

    if (contenuBrut.trim().startsWith('+++')) {
        format = 'toml';
        parsed = matter(contenuBrut, {
            engines: { toml: toml.parse.bind(toml) },
            language: 'toml',
            delimiters: '+++'
        });
    } else {
        parsed = matter(contenuBrut);
    }
    return { data: parsed.data, content: parsed.content, format };
}

function saveMarkdownFile(chemin, data, content, format) {
    let fileString;
    if (format === 'toml') {
        fileString = matter.stringify(content, data, {
            engines: { toml: toml },
            language: 'toml',
            delimiters: '+++'
        });
    } else {
        fileString = matter.stringify(content, data);
    }
    fs.writeFileSync(chemin, fileString);
}

function getFileTree(dirPath) {
    const contentDir = path.join(dirPath, 'content');
    if (!fs.existsSync(contentDir)) return {};

    const tree = {};

    function walk(currentPath, currentTree) {
        const items = fs.readdirSync(currentPath);
        items.forEach(item => {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                currentTree[item] = { _files: [] };
                walk(fullPath, currentTree[item]);
            } else if (item.endsWith('.md')) {
                // On met les fichiers dans une clé spéciale _files
                if (!currentTree._files) currentTree._files = [];
                currentTree._files.push({
                    name: item,
                    fullPath: fullPath,
                    relative: path.relative(dirPath, fullPath)
                });
            }
        });
    }

    tree['content'] = { _files: [] };
    walk(contentDir, tree['content']);
    return tree;
}

module.exports = { getAllFiles, parseMarkdownFile, saveMarkdownFile, getFileTree };