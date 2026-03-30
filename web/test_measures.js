
function convertMeasureToPulgadas(value) {
    const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)$/)
    if (!match) return null
    
    const valW = match[1].replace(',', '.')
    const valH = match[2].replace(',', '.')
    
    const w = Math.round(parseFloat(valW) / 2.54)
    const h = Math.round(parseFloat(valH) / 2.54)
    return `${w}INX${h}IN`
}

console.log("60X21,5 ->", convertMeasureToPulgadas("60X21,5"));
console.log("60X21.5 ->", convertMeasureToPulgadas("60X21.5"));
console.log("21,5X60 ->", convertMeasureToPulgadas("21,5X60"));
