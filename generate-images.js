(async() => {
  // TODO curate list of interesting test SMILES
  // TODO add methods to renderer for generation of multiple types of labels, maybe params like atoms="box", bonds="ends"
  const fs = require('fs-extra')

  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv, cliParams } = require('./src/generator/misc')
  const { labelTypes } = require('./src/generator/types')

  const conf = cliParams()

  console.log('reading smiles file')
  const smilesList = await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount)

  const types = conf.labelType !== labelTypes.all
    ? [conf.labelType]
    : Object.values(labelTypes).filter(t => t !== labelTypes.all)

  if (conf.clean) {
    await fs.remove(conf.outputDirectory)
  }

  await fs.ensureDir(conf.outputDirectory)

  for (const type of types) {
    conf.labelType = type
    const renderer = new Renderer(conf)
    await renderer.init()
    await renderer.imagesFromSmilesList(smilesList)
    await renderer.done()
  }
})()
