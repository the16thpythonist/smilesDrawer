const fs = require('fs');
const readline = require('readline');

const readSmilesFromCsv = async (file, smilesCol, n = 100, header = 1) => {
    const stream = fs.createReadStream(file);
    const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    const result = []
    for await (const line of rl) {
        const smiles = line.split(",")[smilesCol]
        result.push(smiles)
        if (result.length >= n + header) {
            break
        }
    }

    stream.destroy()
    return result.slice(header)
}

module.exports = {readSmilesFromCsv}