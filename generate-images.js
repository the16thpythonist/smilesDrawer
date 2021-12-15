(async() => {
  const fs = require('fs-extra')
  const util = require('util')
  const _ = require('lodash')
  const exec = util.promisify(require('child_process').exec)

  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv, cliParams, hash, setIntersection } = require('./src/generator/misc')

  const conf = cliParams()

  process.setMaxListeners(conf.concurrency)

  console.log('reading smiles file')
  const smilesList = await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount)

  if (conf.clean) {
    console.log(`deleting ${conf.outputDirectory}`)
    await fs.emptyDir(conf.outputDirectory)
  }

  await fs.ensureDir(conf.outputDirectory)

  const valid = smilesList.filter(s => s.length >= conf.minSmilesLength && s.length <= conf.maxSmilesLength).slice(0, conf.amount)
  console.log(`found ${valid.length} SMILES strings with length between ${conf.minSmilesLength} and ${conf.maxSmilesLength} characters`)

  const label = `generating ${smilesList.length} images with concurrency ${this.concurrency}`
  console.time(label)

  const xCmd = `find ${conf.outputDirectory} -type f -name 'x.*'`
  const yCmd = `find ${conf.outputDirectory} -type f -name 'y.*'`
  console.log(xCmd)
  console.log(yCmd)

  let x = await exec(xCmd, { maxBuffer: 100 * 1024 * 1024 })
  let y = await exec(yCmd, { maxBuffer: 100 * 1024 * 1024 })
  x = x.stdout.split('\n').map(x => x.split('/').slice(-2)[0])
  y = y.stdout.split('\n').map(x => x.split('/').slice(-2)[0])

  const existing = setIntersection(new Set(x), new Set(y))

  const smilesToId = {}
  for (const smiles of smilesList) {
    const id = hash(smiles)
    smilesToId[smiles] = existing.has(id) ? null : id
  }

  const missing = smilesList.filter(x => !!smilesToId[x])
  console.log(`removed ${smilesList.length - missing.length} items, ${missing.length} left`)

  // aneb: clear state after every 1000 images
  const numberOfBatches = Math.round(conf.amount / 1000)
  const batches = _.chunk(missing, Math.round(conf.amount / numberOfBatches))

  for (const [index, batch] of batches.entries()) {
    console.log(`processing batch ${index + 1}/${batches.length}`)
    const chunks = _.chunk(batch, Math.ceil(batch.length / conf.concurrency))
    await Promise.all(chunks.map((chunk, index) => new Renderer(conf).generateImages(index, chunk)))
  }

  console.timeEnd(label)
})()
