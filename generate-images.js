(async() => {
  // TODO aneb: make configuration for explicit drawings, it does not work with the current drawer config
  // need to update the Atom.drawExplicit property

  const fs = require('fs-extra')

  const Renderer = require('./src/generator/Renderer')
  const {
    readSmilesFromCsv,
    cliParams
  } = require('./src/generator/misc')
  const { labelTypes } = require('./src/generator/types')

  const conf = cliParams()

  console.log('reading smiles file')
  const smilesList = await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount)

  const types = conf.labelType !== labelTypes.all
    ? [conf.labelType]
    : Object.values(labelTypes).filter(t => t !== labelTypes.all)

  if (conf.clean) {
    await fs.emptyDir(conf.outputDirectory)
  }

  await fs.ensureDir(conf.outputDirectory)

  const valid = smilesList.filter(s => s.length >= conf.minSmilesLength && s.length <= conf.maxSmilesLength).slice(0, conf.amount)
  console.log(`found ${valid.length} SMILES strings with length between ${conf.minSmilesLength} and ${conf.maxSmilesLength} characters`)
  for (const type of types) {
    conf.labelType = type
    const renderer = new Renderer(conf)
    await renderer.imagesFromSmilesList(valid)
  }
})()
