const path = require('path')
const fs = require('fs')
const readline = require('readline')
const colors = require('./colors')

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const readSmilesFromCsv = async(file, smilesCol, n = 100, header = 1) => {
  const stream = fs.createReadStream(file)
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  })

  const result = []
  for await (const line of rl) {
    const smiles = line.split(',')[smilesCol]
    result.push(smiles)
    if (result.length >= n + header) {
      break
    }
  }

  stream.destroy()
  return result.slice(header)
}

const cliParams = () => {
  const {
    filePrefix, directory, amount, quality, scale,
    colors: colorMap,
    fromCsvFile: csvFile,
    fromCsvColumn: csvColumn
  } = yargs(hideBin(process.argv)).argv

  const config = {
    csvFile: path.resolve(csvFile),
    csvColumn: csvColumn,
    filePrefix: filePrefix,
    amount: Number(amount) || null,
    directory: path.join(directory, filePrefix),
    colors: colors[colorMap] || null,
    quality: Number(quality) || null,
    scale: Number(scale) || null
  }

  const invalid = Object.entries(config).filter(([key, value]) => value === null)

  if (invalid.length) {
    throw new Error(`invalid configuration values: ${JSON.stringify(invalid, null)}`)
  }

  return config
}

module.exports = { readSmilesFromCsv, cliParams }
