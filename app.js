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
    'src/assets/images/morpheus.svg',
    'plugin/',
    'LICENSE',
    'REAMDME.md'
];

// Cache for loaded template content
let templateCache = {};

// Cache for Morpheus schema
let morpheusSchema = null;
let schemaLoading = false;

// Load all template files
async function loadTemplateFiles() {
    const promises = templateFiles.map(async (filename) => {
        try {
            // Handle directories differently
            if (filename.endsWith('/')) {
                // For directories, we just mark them as empty string content
                templateCache[filename] = '';
                return;
            }
            
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

// Asynchronously load Morpheus schema
async function loadMorpheusSchema() {
    if (morpheusSchema || schemaLoading) {
        return morpheusSchema;
    }
    
    schemaLoading = true;
    try {
        console.log('Loading Morpheus schema...');
        const response = await fetch('data/morpheus_schema.json');
        if (response.ok) {
            morpheusSchema = await response.json();
            console.log(`Morpheus schema loaded: ${Object.keys(morpheusSchema).length} tables available`);
        } else {
            console.warn('Failed to load Morpheus schema');
            morpheusSchema = {};
        }
    } catch (error) {
        console.warn('Error loading Morpheus schema:', error);
        morpheusSchema = {};
    } finally {
        schemaLoading = false;
    }
    
    return morpheusSchema;
}

// Get schema data (loads if not already loaded)
async function getSchemaData() {
    if (!morpheusSchema) {
        await loadMorpheusSchema();
    }
    return morpheusSchema;
}

// Check if a table exists in the schema
function isValidTable(tableName) {
    return morpheusSchema && morpheusSchema.hasOwnProperty(tableName);
}

// Check if a column exists in a specific table
function isValidColumn(tableName, columnName) {
    return isValidTable(tableName) && morpheusSchema[tableName].includes(columnName);
}

// Get all columns for a table
function getTableColumns(tableName) {
    return isValidTable(tableName) ? morpheusSchema[tableName] : [];
}

// Extract table names from SQL query
function extractTableNames(sqlQuery) {
    if (!sqlQuery || !sqlQuery.trim()) {
        console.log('Empty SQL query provided');
        return [];
    }
    
    try {
        // Clean up the query and normalize whitespace
        const cleanQuery = sqlQuery.replace(/\s+/g, ' ').trim().toUpperCase();
        console.log('Extracting tables from SQL:', cleanQuery);
        
        const tableNames = new Set();
        
        // Simplified approach - find FROM and JOIN keywords
        const words = cleanQuery.split(/\s+/);
        
        for (let i = 0; i < words.length - 1; i++) {
            const word = words[i];
            
            // Look for FROM keyword
            if (word === 'FROM') {
                const nextWord = words[i + 1];
                if (nextWord && !isKeyword(nextWord)) {
                    const tableName = cleanTableName(nextWord);
                    if (tableName) {
                        tableNames.add(tableName.toLowerCase());
                        console.log('Found FROM table:', tableName.toLowerCase());
                    }
                }
            }
            
            // Look for JOIN keyword
            if (word === 'JOIN' || word.endsWith('JOIN')) {
                const nextWord = words[i + 1];
                if (nextWord && !isKeyword(nextWord)) {
                    const tableName = cleanTableName(nextWord);
                    if (tableName) {
                        tableNames.add(tableName.toLowerCase());
                        console.log('Found JOIN table:', tableName.toLowerCase());
                    }
                }
            }
        }
        
        const result = Array.from(tableNames);
        console.log('Final extracted table names:', result);
        return result;
    } catch (error) {
        console.warn('Error extracting table names:', error);
        return [];
    }
}

// Helper function to check if a word is a SQL keyword
function isKeyword(word) {
    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS',
        'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
        'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'DISTINCT', 'ALL',
        'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
    ];
    return keywords.includes(word.toUpperCase());
}

// Helper function to clean table names
function cleanTableName(tableName) {
    if (!tableName) return null;
    
    // Remove quotes and backticks
    let cleaned = tableName.replace(/["`']/g, '');
    
    // Handle schema.table format
    if (cleaned.includes('.')) {
        cleaned = cleaned.split('.').pop();
    }
    
    // Remove any trailing punctuation
    cleaned = cleaned.replace(/[,;()]/g, '');
    
    return cleaned.trim() || null;
}


// Validate for ambiguous column references
function validateColumnAmbiguity(sqlQuery, validTables) {
    if (!sqlQuery || !validTables.length) {
        return [];
    }
    
    try {
        // Extract columns from SELECT clause
        const fieldsString = extractTopLevelSelectFields(sqlQuery);
        if (!fieldsString) return [];
        
        const ambiguousColumns = [];
        const columnReferences = fieldsString.split(',').map(field => {
            const trimmed = field.trim();
            // Remove aliases and get just the column reference
            const columnMatch = trimmed.match(/^([^\\s]+)/);
            return columnMatch ? columnMatch[1] : null;
        }).filter(col => col && !col.includes('.') && !col.includes('(')); // Skip prefixed columns and functions
        
        for (const columnRef of columnReferences) {
            const tablesWithColumn = [];
            
            // Check which tables contain this column
            for (const tableName of validTables) {
                const columns = getTableColumns(tableName);
                if (columns.includes(columnRef)) {
                    tablesWithColumn.push(tableName);
                }
            }
            
            // If column exists in multiple tables, it's ambiguous
            if (tablesWithColumn.length > 1) {
                ambiguousColumns.push({
                    column: columnRef,
                    tables: tablesWithColumn
                });
            }
        }
        
        return ambiguousColumns;
    } catch (error) {
        console.warn('Error validating column ambiguity:', error);
        return [];
    }
}

// Validate for date/time columns that need special handling
function validateDateColumns(sqlQuery, validTables) {
    if (!sqlQuery || !validTables.length) {
        return [];
    }
    
    try {
        // Extract columns from SELECT clause
        const fieldsString = extractTopLevelSelectFields(sqlQuery);
        if (!fieldsString) return [];
        
        const dateColumns = [];
        const dateColumnPatterns = [
            /date/i,
            /time/i,
            /created/i,
            /updated/i,
            /modified/i,
            /timestamp/i
        ];
        
        const columnReferences = fieldsString.split(',').map(field => {
            const trimmed = field.trim();
            // Remove aliases and get just the column reference
            const columnMatch = trimmed.match(/^([^\\s]+)/);
            return columnMatch ? columnMatch[1] : null;
        }).filter(col => col && !col.includes('(')); // Skip functions (already converted)
        
        for (const columnRef of columnReferences) {
            const cleanColumn = columnRef.includes('.') ? columnRef.split('.').pop() : columnRef;
            
            // Check if column name suggests it's a date/time field
            const isDateColumn = dateColumnPatterns.some(pattern => pattern.test(cleanColumn));
            
            if (isDateColumn) {
                // Verify this column exists in the schema and isn't already wrapped in a function
                let foundInTable = false;
                for (const tableName of validTables) {
                    const columns = getTableColumns(tableName);
                    if (columns.includes(cleanColumn)) {
                        foundInTable = true;
                        break;
                    }
                }
                
                if (foundInTable) {
                    dateColumns.push({
                        column: columnRef,
                        suggestion: `DATE_FORMAT(${columnRef}, '%Y-%m-%d %H:%i:%s') as ${cleanColumn}`
                    });
                }
            }
        }
        
        return dateColumns;
    } catch (error) {
        console.warn('Error validating date columns:', error);
        return [];
    }
}

// Validate tables in SQL query against schema and update sidebar
async function validateSQLTables(sqlQuery) {
    // Ensure schema is loaded
    await getSchemaData();
    
    if (!morpheusSchema || Object.keys(morpheusSchema).length === 0) {
        console.warn('Schema not available for validation');
        updateSidebar([]);
        return;
    }
    
    const tableNames = extractTableNames(sqlQuery);
    const invalidTables = [];
    const validTables = [];
    
    for (const tableName of tableNames) {
        if (!isValidTable(tableName)) {
            invalidTables.push(tableName);
        } else {
            validTables.push(tableName);
        }
    }
    
    // Check for ambiguous column references and date columns
    const ambiguousColumns = validateColumnAmbiguity(sqlQuery, validTables);
    const dateColumns = validateDateColumns(sqlQuery, validTables);
    
    // Update sidebar with valid tables
    updateSidebar(validTables);
    
    // Show validation messages (prioritize by severity)
    if (invalidTables.length > 0) {
        const tableList = invalidTables.join(', ');
        const message = invalidTables.length === 1 
            ? `Table '${tableList}' does not exist in the Morpheus database schema.`
            : `Tables '${tableList}' do not exist in the Morpheus database schema.`;
        showToast(message);
    } else if (dateColumns.length > 0) {
        const columnList = dateColumns.map(col => `'${col.column}'`).join(', ');
        const message = `Date/Time columns detected: ${columnList}. These need to be converted to strings using DATE_FORMAT() or CAST() to avoid serialization errors in Morpheus reports.`;
        showToast(message);
    } else if (ambiguousColumns.length > 0) {
        const columnList = ambiguousColumns.map(col => `'${col.column}'`).join(', ');
        const message = ambiguousColumns.length === 1
            ? `Column ${columnList} exists in multiple tables. Please specify the table prefix (e.g., ${ambiguousColumns[0].tables[0]}.${ambiguousColumns[0].column}).`
            : `Columns ${columnList} exist in multiple tables. Please specify table prefixes to avoid ambiguity.`;
        showToast(message);
    }
}

async function generatePreview() {
    // Validate before proceeding
    if (!validateForm()) {
        return;
    }
    
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
    // Validate before proceeding
    if (!validateForm()) {
        return;
    }
    
    const formData = getFormData();
    
    // Ensure templates are loaded
    if (Object.keys(templateCache).length === 0) {
        await loadTemplateFiles();
    }
    
    const processedFiles = processTemplates(formData);
    
    const zip = new JSZip();
    
    // Add each processed template file to the ZIP
    for (const [filename, content] of Object.entries(processedFiles)) {
        if (filename.endsWith('/')) {
            // Create empty directory
            zip.folder(filename.slice(0, -1));
        } else {
            zip.file(filename, content);
        }
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
        
        // Rename REAMDME.md to README.md in the processed filename
        if (processedFilename === 'REAMDME.md') {
            processedFilename = 'README.md';
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
        // Show toast for wildcard error
        if (error.message.includes('Wildcard (*) selectors are not supported')) {
            showToast('Wildcard (*) selectors are not supported. Please specify individual field names.');
        }
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
        'gradle.properties',
        'plugin/',
        'LICENSE'
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
            <h3>Additional assets included in Download</h3>
            <p style="color: #666; margin: 5px 0 10px 0;">The following files & folders are included in the ZIP download but excluded from this preview:</p>
            <ul>
                <li>build.gradle</li>
                <li>gradle.properties</li>
                <li>Makefile</li>
                <li>gradle/wrapper/gradle-wrapper.jar</li>
                <li>gradle/wrapper/gradle-wrapper.properties</li>
                <li>gradlew</li>
                <li>gradlew.bat</li>
                <li>src/assets/images/morpheus.svg</li>
                <li>plugin/</li>
                <li>LICENSE</li>
            </ul>
        </div>
    `;
    
    // Filter out excluded files for preview
    const filteredFiles = Object.entries(files).filter(([filename, content]) => {
        //console.log(files)
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

// Toast notification functions
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideToast();
    }, 5000);
}

// Check for wildcard character on keyup
function checkForWildcard(event) {
    const query = event.target.value;
    if (query.includes('*')) {
        showToast('Wildcard (*) selectors are not supported. Please specify individual field names.');
    }
}

function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
}

// Validation function
function validateForm() {
    // Check required fields
    const reportName = document.getElementById('reportName').value.trim();
    const reportDescription = document.getElementById('reportDescription').value.trim();
    const reportCategory = document.getElementById('reportCategory').value.trim();
    
    if (!reportName) {
        showToast('Please enter a Report Name.');
        return false;
    }
    
    if (!reportDescription) {
        showToast('Please enter a Report Description.');
        return false;
    }
    
    if (!reportCategory) {
        showToast('Please select a Report Category.');
        return false;
    }
    
    const sqlQuery = document.getElementById('sqlQuery').value.trim();
    
    // Check if SQL query contains wildcard
    if (sqlQuery.includes('*')) {
        showToast('Wildcard (*) selectors are not supported. Please specify individual field names.');
        return false;
    }
    
    // Check if SQL query is valid (basic check for SELECT and FROM)
    const cleanQuery = sqlQuery.replace(/\s+/g, ' ').toLowerCase();
    if (!cleanQuery.includes('select') || !cleanQuery.includes('from')) {
        showToast('Please enter a valid SQL SELECT query with FROM clause.');
        return false;
    }
    
    // Check if at least one field is selected
    const selectedFields = getSelectedFieldsWithAliases();
    if (selectedFields.length === 0) {
        showToast('Please select at least one field from the Report Fields section.');
        return false;
    }
    
    return true;
}

// Sidebar functionality
function toggleSidebar() {
    const sidebar = document.getElementById('columnsSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const mainContent = document.getElementById('mainContent');
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        // Close sidebar (compress)
        sidebar.classList.remove('open');
        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '◀';
        toggleBtn.title = 'Expand Database Schema';
        mainContent.classList.remove('sidebar-open');
    } else {
        // Open sidebar (expand)
        sidebar.classList.add('open');
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '▶';
        toggleBtn.title = 'Compress Database Schema';
        mainContent.classList.add('sidebar-open');
    }
}

function updateSidebar(validTables) {
    const tablesContainer = document.getElementById('tablesContainer');
    const sidebarStatus = document.getElementById('sidebarStatus');
    
    if (!validTables || validTables.length === 0) {
        tablesContainer.innerHTML = `
            <div class="no-tables-message">
                <p>No valid tables found in your SQL query.</p>
                <p>Enter a SELECT query with FROM clause to see available columns.</p>
            </div>
        `;
        sidebarStatus.textContent = 'Enter SQL query to see available tables';
        return;
    }
    
    // Update status
    const tableCount = validTables.length;
    const totalColumns = validTables.reduce((sum, tableName) => {
        return sum + getTableColumns(tableName).length;
    }, 0);
    
    sidebarStatus.textContent = `Found ${tableCount} table${tableCount !== 1 ? 's' : ''} with ${totalColumns} available columns`;
    
    // Generate HTML for each table
    let html = '';
    
    for (const tableName of validTables) {
        const columns = getTableColumns(tableName);
        
        html += `
            <div class="table-section">
                <div class="table-header">
                    ${tableName} (${columns.length} columns)
                </div>
                <div class="columns-list">
        `;
        
        for (const column of columns) {
            html += `
                <div class="column-item" 
                     draggable="true" 
                     onclick="insertColumnReference('${tableName}.${column}')" 
                     title="Drag to SQL query or click to copy '${tableName}.${column}'"
                     ondragstart="handleColumnDragStart(event, '${tableName}.${column}')"
                     ondragend="handleColumnDragEnd(event)">
                    ${column}
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    tablesContainer.innerHTML = html;
}

function insertColumnReference(columnRef) {
    // Copy to clipboard
    navigator.clipboard.writeText(columnRef).then(() => {
        // Show brief feedback
        showToast(`Copied "${columnRef}" to clipboard`);
    }).catch(() => {
        // Fallback for older browsers
        showToast(`Column reference: ${columnRef}`);
    });
}

// Drag and drop functionality
function handleColumnDragStart(event, columnRef) {
    // Store the column reference in the drag event
    event.dataTransfer.setData('text/plain', columnRef);
    
    // Add visual feedback
    event.target.classList.add('dragging');
    
    console.log('Drag started for column:', columnRef);
}

function handleColumnDragEnd(event) {
    // Remove visual feedback
    event.target.classList.remove('dragging');
}

function setupTextareaDragAndDrop() {
    const sqlTextarea = document.getElementById('sqlQuery');
    
    if (!sqlTextarea) {
        console.warn('SQL textarea not found');
        return;
    }
    
    // Prevent default drag behavior
    sqlTextarea.addEventListener('dragover', function(event) {
        event.preventDefault();
        event.target.classList.add('drag-over');
    });
    
    sqlTextarea.addEventListener('dragleave', function(event) {
        event.target.classList.remove('drag-over');
    });
    
    sqlTextarea.addEventListener('drop', function(event) {
        event.preventDefault();
        event.target.classList.remove('drag-over');
        
        // Get the column reference from drag data
        const columnRef = event.dataTransfer.getData('text/plain');
        
        if (columnRef) {
            // Insert at cursor position or append
            insertTextAtCursor(event.target, columnRef);
            
            // Trigger field selection update if needed
            updateFieldSelection();
            
            // Show feedback
            showToast(`Added "${columnRef}" to SQL query`);
        }
    });
}

function insertTextAtCursor(textarea, columnRef) {
    // Remove table prefix from column reference (e.g., "users.email" -> "email")
    const columnName = columnRef.includes('.') ? columnRef.split('.').pop() : columnRef;
    
    const sqlQuery = textarea.value;
    
    // Find the position right before the FROM clause
    const fromMatch = sqlQuery.match(/\s+FROM\s+/i);
    
    if (fromMatch) {
        const fromIndex = fromMatch.index;
        const beforeFrom = sqlQuery.substring(0, fromIndex);
        const fromAndAfter = sqlQuery.substring(fromIndex);
        
        // Check if there are already fields selected (look for SELECT)
        const selectMatch = beforeFrom.match(/SELECT\s+/i);
        
        if (selectMatch) {
            // Determine if we need to add a comma
            const fieldsSection = beforeFrom.substring(selectMatch.index + selectMatch[0].length);
            const needsComma = fieldsSection.trim().length > 0 && !fieldsSection.trim().endsWith(',');
            
            // Insert the column name before FROM
            const prefix = needsComma ? ', ' : '';
            textarea.value = beforeFrom + prefix + columnName + fromAndAfter;
            
            // Position cursor after the inserted column
            const newCursorPos = beforeFrom.length + prefix.length + columnName.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        } else {
            // No SELECT found, insert at cursor position as fallback
            insertAtCurrentCursor(textarea, columnName);
        }
    } else {
        // No FROM clause found, insert at cursor position as fallback
        insertAtCurrentCursor(textarea, columnName);
    }
    
    // Focus the textarea
    textarea.focus();
}

function insertAtCurrentCursor(textarea, text) {
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const textBefore = textarea.value.substring(0, startPos);
    const textAfter = textarea.value.substring(endPos, textarea.value.length);
    
    // Add appropriate spacing
    let prefix = '';
    let suffix = '';
    
    // If there's text before and it doesn't end with space or comma, add a space
    if (textBefore && !textBefore.match(/[\s,]$/)) {
        prefix = ' ';
    }
    
    // If there's text after and it doesn't start with space or comma, add a space
    if (textAfter && !textAfter.match(/^[\s,]/)) {
        suffix = ' ';
    }
    
    // Insert the text
    textarea.value = textBefore + prefix + text + suffix + textAfter;
    
    // Set cursor position after inserted text
    const newCursorPos = startPos + prefix.length + text.length + suffix.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
}

// Configuration management constants
const CONFIG_PREFIX = 'morpheus-report-config-';

// Save current configuration to localStorage
function saveConfiguration() {
    try {
        // Validate that we have required fields
        const reportName = document.getElementById('reportName').value.trim();
        const pluginVersion = document.getElementById('pluginVersion').value.trim();
        
        if (!reportName) {
            showToast('Please enter a Report Name before saving.');
            return;
        }
        
        if (!pluginVersion) {
            showToast('Please enter a Plugin Version before saving.');
            return;
        }
        
        // Generate storage key
        const storageKey = CONFIG_PREFIX + generateStorageKey(reportName, pluginVersion);
        
        // Gather all form data
        const configData = {
            // Basic form fields
            reportName: reportName,
            reportDescription: document.getElementById('reportDescription').value,
            namespace: document.getElementById('namespace').value,
            reportCategory: document.getElementById('reportCategory').value,
            pluginVersion: pluginVersion,
            sdkVersion: document.getElementById('sdkVersion').value,
            sqlQuery: document.getElementById('sqlQuery').value,
            pluginAuthor: document.getElementById('pluginAuthor').value,
            pluginOrganization: document.getElementById('pluginOrganization').value,
            pluginRepository: document.getElementById('pluginRepository').value,
            
            // Report fields state
            reportFields: window.parsedFields ? window.parsedFields.map(field => ({
                original: field.original,
                fieldName: field.fieldName,
                dataKey: field.dataKey,
                displayAlias: field.displayAlias,
                selected: field.selected
            })) : [],
            
            // Current field selections and aliases from UI
            currentFieldSelections: getCurrentFieldSelections(),
            
            // Metadata
            savedAt: new Date().toISOString(),
            savedAtFormatted: new Date().toLocaleString()
        };
        
        // Save to localStorage
        localStorage.setItem(storageKey, JSON.stringify(configData));
        
        // Show success message
        showToast(`Configuration "${reportName}" v${pluginVersion} saved successfully!`, 'success');
        
        // Update load button visibility
        updateLoadButtonVisibility();
        
    } catch (error) {
        console.error('Error saving configuration:', error);
        showToast('Failed to save configuration. Please try again.');
    }
}

// Generate storage key from report name and version
function generateStorageKey(reportName, version) {
    return (reportName + '-' + version)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Get current field selections and aliases from the UI
function getCurrentFieldSelections() {
    const selections = [];
    
    if (window.parsedFields) {
        window.parsedFields.forEach((field, index) => {
            const checkbox = document.getElementById(`field_${index}`);
            const aliasInput = document.getElementById(`alias_${index}`);
            
            selections.push({
                index: index,
                selected: checkbox ? checkbox.checked : field.selected,
                displayAlias: aliasInput ? aliasInput.value : field.displayAlias
            });
        });
    }
    
    return selections;
}

// Check for saved configurations and show/hide load button
function updateLoadButtonVisibility() {
    const savedConfigs = getSavedConfigurations();
    const loadContainer = document.getElementById('loadSettingsContainer');
    
    if (savedConfigs.length > 0) {
        loadContainer.style.display = 'block';
    } else {
        loadContainer.style.display = 'none';
    }
}

// Get all saved configurations from localStorage
function getSavedConfigurations() {
    const configs = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CONFIG_PREFIX)) {
            try {
                const configData = JSON.parse(localStorage.getItem(key));
                configs.push({
                    key: key,
                    ...configData
                });
            } catch (error) {
                console.warn(`Failed to parse saved configuration: ${key}`, error);
            }
        }
    }
    
    // Sort by save date (newest first)
    configs.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    
    return configs;
}

// Open the load configuration modal
function openLoadModal() {
    const modal = document.getElementById('loadModal');
    const configList = document.getElementById('configList');
    
    const savedConfigs = getSavedConfigurations();
    
    if (savedConfigs.length === 0) {
        configList.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">No saved configurations found.</p>';
    } else {
        let html = '';
        savedConfigs.forEach(config => {
            html += `
                <div class="config-item" onclick="loadConfiguration('${config.key}')">
                    <div class="config-name">${config.reportName} v${config.pluginVersion}</div>
                    <div class="config-details">
                        <div>Description: ${config.reportDescription || 'No description'}</div>
                        <div>Category: ${config.reportCategory || 'Not specified'}</div>
                        <div>Saved: ${config.savedAtFormatted}</div>
                        <div>Fields: ${config.reportFields ? config.reportFields.length : 0} configured</div>
                    </div>
                </div>
            `;
        });
        configList.innerHTML = html;
    }
    
    modal.style.display = 'block';
}

// Close the load configuration modal
function closeLoadModal(event) {
    const modal = document.getElementById('loadModal');
    
    // Only close if clicking the overlay or close button
    if (!event || event.target === modal || event.target.classList.contains('close-button')) {
        modal.style.display = 'none';
    }
}

// Load a specific configuration
function loadConfiguration(configKey) {
    try {
        const configData = JSON.parse(localStorage.getItem(configKey));
        
        if (!configData) {
            showToast('Configuration not found.');
            return;
        }
        
        // Load basic form fields
        document.getElementById('reportName').value = configData.reportName || '';
        document.getElementById('reportDescription').value = configData.reportDescription || '';
        document.getElementById('namespace').value = configData.namespace || 'com.morpheusreportgenerator.reports';
        document.getElementById('reportCategory').value = configData.reportCategory || '';
        document.getElementById('pluginVersion').value = configData.pluginVersion || '1.0.0';
        document.getElementById('sdkVersion').value = configData.sdkVersion || '1.2.7';
        document.getElementById('sqlQuery').value = configData.sqlQuery || '';
        document.getElementById('pluginAuthor').value = configData.pluginAuthor || '';
        document.getElementById('pluginOrganization').value = configData.pluginOrganization || '';
        document.getElementById('pluginRepository').value = configData.pluginRepository || '';
        
        // Restore report fields state
        if (configData.reportFields && configData.reportFields.length > 0) {
            // Set the global parsed fields
            window.parsedFields = configData.reportFields.map(field => ({
                original: field.original,
                fieldName: field.fieldName,
                dataKey: field.dataKey,
                displayAlias: field.displayAlias,
                selected: field.selected
            }));
            
            // Regenerate the fields UI
            renderFieldsFromSavedState(configData.reportFields, configData.currentFieldSelections);
        } else {
            // Clear fields if none saved
            const fieldsContainer = document.getElementById('fieldsContainer');
            fieldsContainer.innerHTML = '<p style="color: #666; font-style: italic;">Enter a valid SQL SELECT query to see available fields</p>';
            window.parsedFields = null;
        }
        
        // Close the modal
        closeLoadModal();
        
        // Show success message
        showToast(`Configuration "${configData.reportName}" loaded successfully!`, 'success');
        
        // Validate SQL tables if query exists
        if (configData.sqlQuery) {
            validateSQLTables(configData.sqlQuery);
        }
        
    } catch (error) {
        console.error('Error loading configuration:', error);
        showToast('Failed to load configuration. Please try again.');
    }
}

// Render fields UI from saved state
function renderFieldsFromSavedState(savedFields, currentSelections) {
    const fieldsContainer = document.getElementById('fieldsContainer');
    
    if (!savedFields || savedFields.length === 0) {
        fieldsContainer.innerHTML = '<p style="color: #666; font-style: italic;">Enter a valid SQL SELECT query to see available fields</p>';
        return;
    }
    
    let html = '<div class="fields-grid">';
    
    savedFields.forEach((field, index) => {
        // Check if we have current selection data for this field
        const currentSelection = currentSelections ? 
            currentSelections.find(sel => sel.index === index) : null;
        
        const isSelected = currentSelection ? currentSelection.selected : field.selected;
        const displayAlias = currentSelection ? currentSelection.displayAlias : field.displayAlias;
        
        html += `
            <div class="field-item">
                <div class="field-checkbox">
                    <input type="checkbox" id="field_${index}" ${isSelected ? 'checked' : ''} onchange="toggleField(${index})">
                    <label for="field_${index}">${field.dataKey}</label>
                </div>
                <div class="field-alias">
                    <label for="alias_${index}">Display Name:</label>
                    <input type="text" id="alias_${index}" value="${displayAlias}" placeholder="Display name for column">
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    fieldsContainer.innerHTML = html;
}

// Enhanced toast function with success styling
function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    
    // Set styling based on type
    if (type === 'success') {
        toast.style.backgroundColor = '#28a745';
    } else {
        toast.style.backgroundColor = '#dc3545';
    }
    
    toast.classList.add('show');
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        hideToast();
    }, 4000);
}

// Load templates and schema when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Load templates (required for functionality)
    loadTemplateFiles().then(() => {
        console.log('Templates loaded successfully');
    }).catch(error => {
        console.error('Failed to load templates:', error);
    });
    
    // Load Morpheus schema asynchronously (for future validation)
    loadMorpheusSchema().then(() => {
        console.log('Schema loaded in background for validation');
    }).catch(error => {
        console.warn('Schema loading failed (validation features may be limited):', error);
    });
    
    // Setup drag and drop functionality for SQL textarea
    setupTextareaDragAndDrop();
    
    // Check for saved configurations and update load button visibility
    updateLoadButtonVisibility();
});