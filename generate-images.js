(async() => {
  // TODO curate list of interesting test SMILES
  // TODO add methods to renderer for generation of multiple types of labels, maybe params like atoms="box", bonds="ends"

  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv, cliParams } = require('./src/generator/misc')

  const conf = cliParams()

  console.log('reading smiles file')
  const smilesList = await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount)

  const renderer = new Renderer(conf)
  await renderer.init()

  await renderer.smilesToImage(smilesList)

  await renderer.done()
})()
