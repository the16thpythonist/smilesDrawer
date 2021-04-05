const path = require('path')
const fs = require('fs')
const readline = require('readline')
const colors = require('./colors')

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const { labelTypes } = require('./types')

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
    outputDirectory,
    amount,
    quality,
    scale,
    concurrency,
    labelType,
    segment,
    outputSvg,
    outputLabels,
    clean,
    colors: colorMap,
    fromCsvFile: csvFile,
    fromCsvColumn: csvColumn
  } = yargs(hideBin(process.argv)).argv

  const config = {
    csvFile: path.resolve(csvFile),
    csvColumn: csvColumn,
    amount: Number(amount) || null,
    outputDirectory: path.resolve(outputDirectory),
    colors: colors[colorMap] || null,
    quality: Number(quality) || null,
    scale: Number(scale) || null,
    concurrency: Number(concurrency) || 4,
    labelType: labelType || null,
    segment: !!segment,
    outputSvg: !!outputSvg,
    outputLabels: !!outputLabels,
    clean: !!clean
  }

  if (!Object.keys(labelTypes).includes(config.labelType)) {
    throw new Error(`invalid label type '${config.labelType}'`)
  }

  const invalid = Object.entries(config).filter(([key, value]) => value === null)

  if (invalid.length) {
    throw new Error(`invalid configuration values: ${JSON.stringify(invalid, null)}`)
  }

  return config
}

module.exports = {
  readSmilesFromCsv,
  cliParams
}
