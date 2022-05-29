/* eslint-disable */
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const readline = require('readline')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const readSmilesFromCsv = async(file, smilesCol, n = 100) => {
  const stream = fs.createReadStream(file)
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  })

  const result = []
  for await (const line of rl) {
    const smiles = line.split(',')[smilesCol]
    result.push(smiles)
    if (result.length >= 1.25 * n) {
      break
    }
  }

  stream.destroy()
  return result
}

// 29.05.2022: Added argv as default argument to the function to allow mocking the arguments within the
// unittests.
function cliParams(argv = process.argv) {

  // "yargs" is a library which helps with the handling of command line arguments. The command line
  // arguments are originally just a list of strings in "process.argv" which is basically just the
  // whitespace separation of the command line string.
  // yargs processes this into an object ultimately, where the keys are the camelCase variants of the the
  // command line parameters and the values the corresponding values.
  const {
    outputDirectory,
    amount, batchSize, size, fonts, fontWeights,
    concurrency,
    outputSvg, outputLabels, outputFlat,
    clean,
    minSmilesLength, maxSmilesLength,
    fromCsvFile: csvFile,
    fromCsvColumn: csvColumn,
    // 29.05.2022: Added to support non randomized image generation mode
    randomization,
    optionsPath,
  } = yargs(hideBin(argv)).argv

  // "optionsPath" is supposed to be a path towards a JS module which exports a single function, that will
  // return the "options" object for the rendering process given an arguments object.
  let options;
  if (optionsPath !== undefined) {
    try {
      options = require(path.resolve(optionsPath));
    } catch(error) {
      throw new Error(`The options file at ${optionsPath} is either not a valid .JS file or does not 
                       correctly export the "options" callback!`);
    }
  }

  // This section then processes these raw (string) values which we receive from the command line into
  // appropriate types
  const config = {
    csvFile: path.resolve(csvFile),
    csvColumn: csvColumn,
    amount: Number(amount) || null,
    batchSize: Number(batchSize) || 100,
    outputDirectory: path.resolve(outputDirectory),
    size: Number(size) || null,
    fonts: fonts ? fonts.split(',') : ['Roboto'],
    fontWeights: fontWeights ? fontWeights.split(',').map(x => Number(x)) : [200],
    concurrency: Number(concurrency) || 4,
    outputSvg: !!outputSvg,
    outputLabels: !!outputLabels,
    outputFlat: !!outputFlat,
    clean: !!clean,
    maxSmilesLength: Number(maxSmilesLength) || 1000,
    minSmilesLength: Number(minSmilesLength) || 0,
    randomization: (randomization === undefined ? true : randomization),
    optionsPath: (optionsPath === undefined) ? '' : path.resolve(optionsPath),
    optionsCallback: (options === undefined ? ({}) => {} : options.options)
  }

  const invalid = Object.entries(config).filter(([key, value]) => value === null)

  if (invalid.length) {
    throw new Error(`invalid configuration values: ${JSON.stringify(invalid, null)}`)
  }

  return config
}

const hash = function(x) {
  return crypto.createHash('sha256').update(x).digest('hex')
}

const setIntersection = (setA, setB) => {
  const _intersection = new Set()
  for (const elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem)
    }
  }
  return _intersection
}

const wait = ms => new Promise((resolve, reject) => {
  setTimeout(resolve, ms)
})

module.exports = {
  readSmilesFromCsv,
  cliParams,
  hash,
  setIntersection,
  wait
}
