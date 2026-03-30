// Quick test for technical block translation logic
const { translateField } = require('./src/lib/engine/translator');

const mockFieldConfig = {
    fallback_strategy: 'translate',
    behavior: 'translate_and_emit'
};

const mockGlossary = {}; // Empty glossary to test internal logic

const testCases = [
    "RIEL FULL EXTENSION CIERRE LENTO",
    "RFE CIERRE LENTO",
    "RIEL OCULTO CIERRE LENTO",
    "R OCULTO CIERRE LENTO",
    "RIEL OCULTO + RIEL FULL EXTENSION CIERRE LENTO",
    "R OCULTO + RFE CIERRE LENTO",
    "+",
    "MANIJA NEGRA",
    "R"
];

console.log("=== Testing Technical Blocks ===");
testCases.forEach(input => {
    const missingTerms = [];
    const warnings = [];
    const result = translateField(input, mockFieldConfig, mockGlossary, missingTerms, warnings);
    console.log(`Input: "${input}"`);
    console.log(`Output: "${result}"`);
    console.log(`Missing Terms: [${missingTerms.join(', ')}]`);
    console.log("-------------------");
});
