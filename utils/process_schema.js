const fs = require('fs');
const path = require('path');

// Read the CSV file (go up one directory from utils to reach tmp)
const csvPath = path.join(__dirname, '..', 'tmp', 'query_result.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

// Parse CSV and create schema object
const lines = csvContent.split('\n');
const schema = {};

// Skip header line and process each row
for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handling quoted values)
    const match = line.match(/^"([^"]+)","([^"]+)"$/);
    if (match) {
        const tableName = match[1];
        const columnName = match[2];
        
        // Initialize array if table doesn't exist
        if (!schema[tableName]) {
            schema[tableName] = [];
        }
        
        // Add column to table
        schema[tableName].push(columnName);
    }
}

// Save to data directory (go up one directory from utils to reach data)
const outputPath = path.join(__dirname, '..', 'data', 'morpheus_schema.json');
fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log(`Schema processed successfully! Generated ${Object.keys(schema).length} tables with ${Object.values(schema).reduce((sum, cols) => sum + cols.length, 0)} total columns.`);
console.log(`Output saved to: ${outputPath}`);