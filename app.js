// Template file structure for the Morpheus plugin
const templateFiles = [
    'build.gradle',
    'gradle.properties', 
    'Makefile',
    'gradlew',
    'gradlew.bat',
    'gradle/wrapper/gradle-wrapper.jar',
    'gradle/wrapper/gradle-wrapper.properties',
    'src/main/groovy/{{PLUGIN_CLASS_NAME}}.groovy',
    'src/main/groovy/{{REPORT_CLASS_NAME}}.groovy',
    'src/main/resources/renderer/hbs/{{REPORT_TEMPLATE}}.hbs',
    'src/assets/images/morpheus.svg'
];

// Cache for loaded template content
let templateCache = {};

// Load all template files
async function loadTemplateFiles() {
    const promises = templateFiles.map(async (filename) => {
        try {
            const response = await fetch(`templates/${filename}`);
            if (response.ok) {
                const content = filename.endsWith('.jar') || filename.endsWith('.svg') ? 
                    await response.blob() : await response.text();
                templateCache[filename] = content;
            } else {
                console.warn(`Failed to load template: ${filename}`);
                templateCache[filename] = '';
            }
        } catch (error) {
            console.warn(`Error loading template ${filename}:`, error);
            templateCache[filename] = '';
        }
    });
    
    await Promise.all(promises);
}

async function generatePreview() {
    const formData = getFormData();
    
    // Ensure templates are loaded
    if (Object.keys(templateCache).length === 0) {
        await loadTemplateFiles();
    }
    
    const processedFiles = processTemplates(formData);
    
    const newTab = window.open('', '_blank');
    newTab.document.write(generatePreviewHTML(processedFiles));
    newTab.document.close();
}

async function generateAndDownload() {
    const formData = getFormData();
    
    // Ensure templates are loaded
    if (Object.keys(templateCache).length === 0) {
        await loadTemplateFiles();
    }
    
    const processedFiles = processTemplates(formData);
    
    const zip = new JSZip();
    
    // Add each processed template file to the ZIP
    for (const [filename, content] of Object.entries(processedFiles)) {
        zip.file(filename, content);
    }
    
    
    // Generate and download the ZIP file
    zip.generateAsync({ type: 'blob' }).then(function(content) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        const sanitizedFileName = sanitizeFileName(formData.reportName || 'morpheus-report');
        link.download = `${sanitizedFileName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function getFormData() {
    // Get selected fields and updated aliases
    const selectedFields = getSelectedFieldsWithAliases();
    
    // Clean report name by removing single quotes and apostrophes
    const cleanReportName = document.getElementById('reportName').value.replace(/[']/g, '');
    
    return {
        reportName: cleanReportName,
        reportDescription: document.getElementById('reportDescription').value,
        namespace: document.getElementById('namespace').value,
        reportCategory: document.getElementById('reportCategory').value,
        pluginVersion: document.getElementById('pluginVersion').value,
        sdkVersion: document.getElementById('sdkVersion').value,
        sqlQuery: document.getElementById('sqlQuery').value,
        pluginAuthor: document.getElementById('pluginAuthor').value,
        pluginOrganization: document.getElementById('pluginOrganization').value,
        pluginRepository: document.getElementById('pluginRepository').value,
        selectedFields: selectedFields
    };
}

function getSelectedFieldsWithAliases() {
    if (!window.parsedFields) {
        return [];
    }
    
    // Get current alias values from inputs and selection state from checkboxes
    return window.parsedFields.map((field, index) => {
        const checkbox = document.getElementById(`field_${index}`);
        const aliasInput = document.getElementById(`alias_${index}`);
        
        return {
            original: field.original,
            fieldName: field.fieldName,
            dataKey: field.dataKey, // Use for handlebars data access
            displayAlias: aliasInput ? aliasInput.value || field.displayAlias : field.displayAlias, // Use for column headers
            selected: checkbox ? checkbox.checked : field.selected
        };
    }).filter(field => field.selected);
}

function processTemplates(formData) {
    const processed = {};
    
    // Generate placeholder values
    const pluginClassName = generatePluginClassName(formData.reportName);
    const reportClassName = generateReportClassName(formData.reportName);
    const pluginCode = generatePluginCode(formData.reportName);
    const reportCode = generateReportCode(formData.reportName);
    const reportTemplate = generateReportTemplateFile(formData.reportName);
    const namespacePath = generateNamespacePath(formData.namespace);
    
    // Template placeholder replacements with sensible defaults
    const replacements = {
        '{{NAMESPACE}}': formData.namespace || 'com.morpheusreportgenerator.reports',
        '{{NAMESPACE_PATH}}': namespacePath,
        '{{PLUGIN_CLASS_NAME}}': pluginClassName,
        '{{REPORT_CLASS_NAME}}': reportClassName,
        '{{PLUGIN_CODE}}': pluginCode,
        '{{REPORT_CODE}}': reportCode,
        '{{PLUGIN_NAME}}': formData.reportName || 'Custom Report Plugin',
        '{{PLUGIN_DESCRIPTION}}': formData.reportDescription || 'A custom report plugin generated for Morpheus',
        '{{PLUGIN_ORGANIZATION}}': formData.pluginOrganization || 'Custom Plugin Developer',
        '{{PLUGIN_AUTHOR}}': formData.pluginAuthor || 'Morpheus Plugin Generator',
        '{{PLUGIN_VERSION}}': formData.pluginVersion || '1.0.0',
        '{{PLUGIN_REPO}}': formData.pluginRepository || 'https://github.com/yourorg/yourplugin',
        '{{REPORT_NAME}}': formData.reportName || 'Custom Report',
        '{{REPORT_DESCRIPTION}}': formData.reportDescription || 'A custom report generated for Morpheus',
        '{{REPORT_CATEGORY}}': formData.reportCategory || 'inventory',
        '{{REPORT_TEMPLATE}}': reportTemplate,
        '{{SQL_QUERY}}': formData.sqlQuery || 'SELECT 1 as example_column',
        '{{OWNER_ONLY}}': 'false',
        '{{MASTER_ONLY}}': 'false',
        '{{SDK_VERSION}}': formData.sdkVersion || '0.15.4'
    };
    
    // Process each template file
    for (const [filename, content] of Object.entries(templateCache)) {
        let processedFilename = filename;
        let processedContent = content;
        
        // Replace placeholders in filename
        for (const [placeholder, value] of Object.entries(replacements)) {
            processedFilename = processedFilename.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
        
        // Replace placeholders in content (only for text files)
        if (typeof content === 'string') {
            // Special handling for handlebars template
            if (filename.includes('{{REPORT_TEMPLATE}}.hbs')) {
                processedContent = generateHandlebarsTemplate(formData);
            } else {
                for (const [placeholder, value] of Object.entries(replacements)) {
                    processedContent = processedContent.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
                }
            }
        }
        
        // Adjust file path for namespace
        if (processedFilename.includes('src/main/groovy/')) {
            processedFilename = processedFilename.replace('src/main/groovy/', `src/main/groovy/${namespacePath}/`);
        }
        
        processed[processedFilename] = processedContent;
    }
    
    return processed;
}

function generatePluginClassName(reportName) {
    if (!reportName) return 'CustomReportPlugin';
    
    return reportName
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[a-z]/, match => match.toUpperCase()) + 'Plugin';
}

function generateReportClassName(reportName) {
    if (!reportName) return 'CustomReportProvider';
    
    return reportName
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[a-z]/, match => match.toUpperCase()) + 'Provider';
}

function generatePluginCode(reportName) {
    if (!reportName) return 'custom-report-plugin';
    
    return reportName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + '-plugin';
}

function generateReportCode(reportName) {
    if (!reportName) return 'custom-report';
    
    return reportName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateReportTemplateFile(reportName) {
    if (!reportName) return 'customReport';
    
    return reportName
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[A-Z]/, match => match.toLowerCase()) + 'Report';
}

function generateNamespacePath(namespace) {
    if (!namespace) return 'com/morpheusreportgenerator/reports';
    
    return namespace.replace(/\./g, '/');
}

function sanitizeFileName(filename) {
    if (!filename) return 'morpheus-report';
    
    return filename
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'morpheus-report';
}

function extractTopLevelSelectFields(query) {
    // Find the first SELECT keyword (case-insensitive)
    const selectIndex = query.toLowerCase().indexOf('select');
    if (selectIndex === -1) {
        return null;
    }
    
    // Start scanning after SELECT keyword
    let pos = selectIndex + 6; // 6 = length of 'select'
    
    // Skip whitespace after SELECT
    while (pos < query.length && /\s/.test(query[pos])) {
        pos++;
    }
    
    let parenDepth = 0;
    let fieldsStart = pos;
    let fieldsEnd = -1;
    
    // Scan character by character to find the matching FROM
    for (let i = pos; i < query.length; i++) {
        const char = query[i];
        
        if (char === '(') {
            parenDepth++;
        } else if (char === ')') {
            parenDepth--;
        } else if (parenDepth === 0) {
            // Only check for FROM when not inside parentheses
            const remaining = query.substring(i);
            if (remaining.toLowerCase().match(/^from\s/i)) {
                fieldsEnd = i;
                break;
            }
        }
    }
    
    if (fieldsEnd === -1) {
        // No FROM found - could be invalid query or just SELECT fields without FROM
        return null;
    }
    
    // Extract the fields string between SELECT and FROM
    const fieldsString = query.substring(fieldsStart, fieldsEnd).trim();
    return fieldsString;
}

function parseSQLFields(sqlQuery) {
    if (!sqlQuery || !sqlQuery.trim()) {
        return [];
    }
    
    try {
        // Remove line breaks and extra spaces
        const cleanQuery = sqlQuery.replace(/\s+/g, ' ').trim();
        
        // Find the top-level SELECT statement only
        const fieldsString = extractTopLevelSelectFields(cleanQuery);
        
        if (!fieldsString) {
            return [];
        }
        
        // Check for wildcard - not allowed in Phase 2
        if (fieldsString.includes('*')) {
            throw new Error('Wildcard (*) selectors are not supported. Please specify individual field names.');
        }
        
        // Split by comma and clean up each field
        const fields = fieldsString.split(',').map(field => {
            const trimmed = field.trim();
            
            // Handle aliases (field AS alias or field alias)
            const aliasMatch = trimmed.match(/^(.+?)\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i);
            
            if (aliasMatch) {
                return {
                    original: trimmed,
                    fieldName: aliasMatch[1].trim(),
                    dataKey: aliasMatch[2].trim(), // SQL alias becomes data access key
                    displayAlias: aliasMatch[2].trim(), // Default display alias to SQL alias
                    selected: true
                };
            } else {
                // No alias, extract clean field name
                const cleanField = trimmed.replace(/^.*\./, ''); // Remove table prefix if present
                return {
                    original: trimmed,
                    fieldName: trimmed,
                    dataKey: cleanField, // Use clean field name as data key
                    displayAlias: cleanField, // Default display alias to clean field name
                    selected: true
                };
            }
        }).filter(field => field.fieldName.length > 0);
        
        return fields;
    } catch (error) {
        console.warn('SQL parsing error:', error.message);
        return [];
    }
}

function updateFieldSelection() {
    const sqlQuery = document.getElementById('sqlQuery').value;
    const fieldsContainer = document.getElementById('fieldsContainer');
    
    try {
        const fields = parseSQLFields(sqlQuery);
        
        if (fields.length === 0) {
            fieldsContainer.innerHTML = '<p style="color: #666; font-style: italic;">Enter a valid SQL SELECT query to see available fields</p>';
            return;
        }
        
        let html = '<div class="fields-grid">';
        
        fields.forEach((field, index) => {
            html += `
                <div class="field-item">
                    <div class="field-checkbox">
                        <input type="checkbox" id="field_${index}" checked onchange="toggleField(${index})">
                        <label for="field_${index}">${field.dataKey}</label>
                    </div>
                    <div class="field-alias">
                        <label for="alias_${index}">Display Name:</label>
                        <input type="text" id="alias_${index}" value="${field.displayAlias}" placeholder="Display name for column">
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        fieldsContainer.innerHTML = html;
        
        // Store fields data globally for access by other functions
        window.parsedFields = fields;
        
    } catch (error) {
        fieldsContainer.innerHTML = `<p style="color: #d63384;">${error.message}</p>`;
    }
}

function toggleField(index) {
    if (window.parsedFields && window.parsedFields[index]) {
        const checkbox = document.getElementById(`field_${index}`);
        window.parsedFields[index].selected = checkbox.checked;
    }
}

function generateHandlebarsTemplate(formData) {
    const reportName = formData.reportName || 'Custom Report';
    const selectedFields = formData.selectedFields || [];
    
    if (selectedFields.length === 0) {
        // Fallback template if no fields selected
        return `<style>
    th, td {
        line-height: 32px !important;
        padding-top: 5px;
    }

    .custom-border-bottom {
        border-bottom: 2px solid #ddd;
    }

    #morpheus-report h2 {
        border-bottom: 1px solid #ddd;
        margin: 10px 0 20px;
        padding: 0 0 5px;
    }
</style>

<div id="morpheus-report">
    <div id="report-main">
        <h2>${reportName}</h2>
        <p>No fields selected for this report.</p>
    </div>
</div>`;
    }
    
    // Generate table cells based on data keys (not display aliases)
    const tableCells = selectedFields.map(field => `                    <td>{{dataMap.${field.dataKey}}}</td>`).join('\n');
    
    return `<style>
    /* Custom report styling */
    th, td {
        line-height: 32px !important;
        padding-top: 5px;
    }

    .custom-border-bottom {
        border-bottom: 2px solid #ddd;
    }

    #morpheus-report h2 {
        border-bottom: 1px solid #ddd;
        margin: 10px 0 20px;
        padding: 0 0 5px;
    }

    .force-center {
        text-align: center !important;
    }
</style>

<div id="morpheus-report">
    {{#if header}}
    <div id="report-header">
        <div class="break-container intro-stats">
            <h2>Summary</h2>
            <div class="count-stats">
                <div class="stats-container">
                    <span class="big-stat">
                        {{header.0.dataMap.totalRecords}}
                    </span>
                    <span class="stat-label">
                        Total Records
                    </span>
                </div>
            </div>
        </div>
    </div>
    {{/if}}

    <div id="report-main">
        <h2>${reportName}</h2>
        <table class="table table-striped custom-border-bottom">
            <thead>
                <tr>
${selectedFields.map(field => `                    <th>${field.displayAlias}</th>`).join('\n')}
                </tr>
            </thead>
            <tbody>
                {{#each main}}
                <tr>
${tableCells}
                </tr>
                {{/each}}
            </tbody>
        </table>
    </div>
</div>`;
}

function generatePreviewHTML(files) {
    // Files to exclude from preview but keep in download
    const excludeFromPreview = [
        'gradle/wrapper/gradle-wrapper.jar',
        'src/assets/images/morpheus.svg',
        'gradle/wrapper/gradle-wrapper.properties',
        'gradlew.bat',
        'gradlew',
        'build.gradle',
        'Makefile',
        'gradle.properties'
    ];
    
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Morpheus Plugin Files</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .file-section {
            background: white;
            margin-bottom: 30px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .file-header {
            background: #333;
            color: white;
            padding: 15px 20px;
            font-weight: bold;
        }
        .file-content {
            padding: 0;
        }
        pre {
            margin: 0;
            padding: 20px;
            background: #f8f9fa;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.4;
        }
        .binary-file {
            padding: 20px;
            text-align: center;
            color: #666;
            font-style: italic;
        }
        .excluded-files {
            background: #f8f9fa;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 8px;
            border-left: 4px solid #007bff;
        }
        .excluded-files h3 {
            margin: 0 0 10px 0;
            color: #666;
            font-size: 16px;
        }
        .excluded-files ul {
            margin: 0;
            padding-left: 20px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Generated Morpheus Plugin Files</h1>
        
        <div class="excluded-files">
            <h3>Additional Files Included in Download</h3>
            <p style="color: #666; margin: 5px 0 10px 0;">The following files are included in the ZIP download but excluded from this preview:</p>
            <ul>
                <li>build.gradle</li>
                <li>gradle.properties</li>
                <li>Makefile</li>
                <li>gradle/wrapper/gradle-wrapper.jar</li>
                <li>gradle/wrapper/gradle-wrapper.properties</li>
                <li>gradlew</li>
                <li>gradlew.bat</li>
                <li>src/assets/images/morpheus.svg</li>
            </ul>
        </div>
    `;
    
    // Filter out excluded files for preview
    const filteredFiles = Object.entries(files).filter(([filename, content]) => {
        return !excludeFromPreview.some(excludePattern => filename.includes(excludePattern));
    });
    
    for (const [filename, content] of filteredFiles) {
        html += `
        <div class="file-section">
            <div class="file-header">${filename}</div>
            <div class="file-content">
        `;
        
        if (typeof content === 'string') {
            html += `<pre><code>${escapeHtml(content)}</code></pre>`;
        } else {
            html += `<div class="binary-file">Binary file (${filename.split('.').pop().toUpperCase()})</div>`;
        }
        
        html += `
            </div>
        </div>
        `;
    }
    
    html += `
    </div>
</body>
</html>
    `;
    
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load templates when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadTemplateFiles().then(() => {
        console.log('Templates loaded successfully');
    }).catch(error => {
        console.error('Failed to load templates:', error);
    });
});